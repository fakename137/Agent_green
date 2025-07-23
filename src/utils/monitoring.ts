import { config } from '../config/production';

export interface Metrics {
  totalTokensAnalyzed: number;
  successfulTrades: number;
  failedTrades: number;
  totalProfit: number;
  totalLoss: number;
  averageScore: number;
  riskDistribution: Record<string, number>;
  errorCounts: Record<string, number>;
  lastUpdated: Date;
}

export interface Alert {
  id: string;
  type: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  context?: any;
  timestamp: Date;
}

class MonitoringService {
  private metrics: Metrics = {
    totalTokensAnalyzed: 0,
    successfulTrades: 0,
    failedTrades: 0,
    totalProfit: 0,
    totalLoss: 0,
    averageScore: 0,
    riskDistribution: {},
    errorCounts: {},
    lastUpdated: new Date(),
  };

  private alerts: Alert[] = [];
  private readonly maxAlerts = 1000;

  updateMetrics(update: Partial<Metrics>): void {
    if (!config.MONITORING.ENABLE_METRICS) return;

    this.metrics = {
      ...this.metrics,
      ...update,
      lastUpdated: new Date(),
    };

    // Log metrics periodically
    if (this.shouldLogMetrics()) {
      this.logMetrics();
    }
  }

  incrementCounter(key: keyof Pick<Metrics, 'totalTokensAnalyzed' | 'successfulTrades' | 'failedTrades'>): void {
    this.metrics[key]++;
    this.metrics.lastUpdated = new Date();
  }

  addError(errorType: string): void {
    this.metrics.errorCounts[errorType] = (this.metrics.errorCounts[errorType] || 0) + 1;
    this.metrics.lastUpdated = new Date();
  }

  updateRiskDistribution(category: string): void {
    this.metrics.riskDistribution[category] = (this.metrics.riskDistribution[category] || 0) + 1;
    this.metrics.lastUpdated = new Date();
  }

  addProfit(amount: number): void {
    if (amount > 0) {
      this.metrics.totalProfit += amount;
    } else {
      this.metrics.totalLoss += Math.abs(amount);
    }
    this.metrics.lastUpdated = new Date();

    // Check for significant loss alert
    if (amount < -100) {
      this.sendAlert('WARNING', `Significant loss detected: $${Math.abs(amount)}`, { amount });
    }
  }

  async sendAlert(type: Alert['type'], message: string, context?: any): Promise<void> {
    if (!config.MONITORING.ENABLE_ALERTS) return;

    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      context,
      timestamp: new Date(),
    };

    this.alerts.unshift(alert);
    
    // Keep only the latest alerts
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }

    // Send to external webhook if configured
    if (config.MONITORING.WEBHOOK_URL) {
      try {
        await fetch(config.MONITORING.WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alert),
        });
      } catch (error) {
        console.error('Failed to send alert to webhook:', error);
      }
    }

    // Log critical alerts
    if (type === 'ERROR') {
      console.error(`🚨 ALERT: ${message}`, context);
    } else if (type === 'WARNING') {
      console.warn(`⚠️ WARNING: ${message}`, context);
    } else {
      console.info(`ℹ️ INFO: ${message}`, context);
    }
  }

  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  getAlerts(limit: number = 100): Alert[] {
    return this.alerts.slice(0, limit);
  }

  getHealthStatus(): { status: 'healthy' | 'degraded' | 'unhealthy'; details: any } {
    const errorRate = this.calculateErrorRate();
    const profitLossRatio = this.metrics.totalProfit / (this.metrics.totalLoss || 1);
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (errorRate > 0.5 || profitLossRatio < 0.5) {
      status = 'unhealthy';
    } else if (errorRate > 0.2 || profitLossRatio < 0.8) {
      status = 'degraded';
    }

    return {
      status,
      details: {
        errorRate,
        profitLossRatio,
        totalTrades: this.metrics.successfulTrades + this.metrics.failedTrades,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },
    };
  }

  private calculateErrorRate(): number {
    const totalTrades = this.metrics.successfulTrades + this.metrics.failedTrades;
    return totalTrades > 0 ? this.metrics.failedTrades / totalTrades : 0;
  }

  private shouldLogMetrics(): boolean {
    // Log metrics every 100 trades or 10 minutes
    const tradeThreshold = (this.metrics.successfulTrades + this.metrics.failedTrades) % 100 === 0;
    const timeThreshold = Date.now() - this.metrics.lastUpdated.getTime() > 10 * 60 * 1000;
    return tradeThreshold || timeThreshold;
  }

  private logMetrics(): void {
    console.log('📊 METRICS UPDATE:', {
      tokensAnalyzed: this.metrics.totalTokensAnalyzed,
      trades: `${this.metrics.successfulTrades}/${this.metrics.failedTrades} (success/fail)`,
      pnl: `$${this.metrics.totalProfit.toFixed(2)} profit / $${this.metrics.totalLoss.toFixed(2)} loss`,
      errorRate: `${(this.calculateErrorRate() * 100).toFixed(1)}%`,
      riskDistribution: this.metrics.riskDistribution,
    });
  }
}

export const monitoring = new MonitoringService();

// Performance tracking utilities
export function trackPerformance<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  
  return operation()
    .then(result => {
      const duration = Date.now() - start;
      console.log(`⏱️ ${name} completed in ${duration}ms`);
      return result;
    })
    .catch(error => {
      const duration = Date.now() - start;
      console.error(`❌ ${name} failed after ${duration}ms:`, error.message);
      monitoring.addError(name);
      throw error;
    });
}

export function createPerformanceLogger(stepName: string) {
  const start = Date.now();
  
  return {
    log: (message: string) => {
      const elapsed = Date.now() - start;
      console.log(`[${stepName}] ${message} (+${elapsed}ms)`);
    },
    error: (message: string, error?: any) => {
      const elapsed = Date.now() - start;
      console.error(`[${stepName}] ${message} (+${elapsed}ms)`, error);
    },
    complete: () => {
      const total = Date.now() - start;
      console.log(`[${stepName}] Completed in ${total}ms`);
      return total;
    },
  };
}
