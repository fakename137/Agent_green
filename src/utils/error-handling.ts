import { config } from '../config/production';

export class CircuitBreakerError extends Error {
  constructor(service: string) {
    super(`Circuit breaker open for ${service}`);
    this.name = 'CircuitBreakerError';
  }
}

export class TradingError extends Error {
  constructor(message: string, public readonly tokenAddress?: string) {
    super(message);
    this.name = 'TradingError';
  }
}

export class RiskManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RiskManagementError';
  }
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export class CircuitBreaker {
  private services = new Map<string, CircuitBreakerState>();
  private readonly failureThreshold = 5;
  private readonly recoveryTimeMs = 60000; // 1 minute
  private readonly halfOpenMaxCalls = 3;

  async execute<T>(
    serviceName: string,
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const state = this.getServiceState(serviceName);

    if (state.state === 'OPEN') {
      if (Date.now() - state.lastFailureTime > this.recoveryTimeMs) {
        state.state = 'HALF_OPEN';
        state.failures = 0;
      } else {
        if (fallback) {
          return await fallback();
        }
        throw new CircuitBreakerError(serviceName);
      }
    }

    try {
      const result = await operation();
      this.onSuccess(serviceName);
      return result;
    } catch (error) {
      this.onFailure(serviceName);
      if (fallback && state.state === 'OPEN') {
        return await fallback();
      }
      throw error;
    }
  }

  private getServiceState(serviceName: string): CircuitBreakerState {
    if (!this.services.has(serviceName)) {
      this.services.set(serviceName, {
        failures: 0,
        lastFailureTime: 0,
        state: 'CLOSED',
      });
    }
    return this.services.get(serviceName)!;
  }

  private onSuccess(serviceName: string): void {
    const state = this.getServiceState(serviceName);
    state.failures = 0;
    state.state = 'CLOSED';
  }

  private onFailure(serviceName: string): void {
    const state = this.getServiceState(serviceName);
    state.failures++;
    state.lastFailureTime = Date.now();

    if (state.failures >= this.failureThreshold) {
      state.state = 'OPEN';
    }
  }

  getStatus(): Record<string, CircuitBreakerState> {
    return Object.fromEntries(this.services);
  }
}

export const circuitBreaker = new CircuitBreaker();

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = config.DATA_SOURCES.RETRY_ATTEMPTS,
  delayMs: number = config.DATA_SOURCES.RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff
      const delay = delayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number = config.DATA_SOURCES.TIMEOUT_MS
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    ),
  ]);
}

export function handleError(error: unknown, context: string): Error {
  if (error instanceof Error) {
    return error;
  }
  
  return new Error(`${context}: ${String(error)}`);
}
