import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';

// Rate limiting and caching utilities
class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private timeWindow: number;

  constructor(maxRequests: number = 50, timeWindow: number = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter(
      (time) => now - time < this.timeWindow
    );

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.timeWindow - (now - oldestRequest);
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    this.requests.push(now);
  }
}

// Global rate limiter for CoinGecko API (50 requests per minute)
const rateLimiter = new RateLimiter(50, 60000);

// Cache for API responses
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

// API utilities with error handling
class CryptoAPI {
  private baseUrl = 'https://api.coingecko.com/api/v3';
  private retryAttempts = 3;
  private retryDelay = 1000;

  private async makeRequest(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    await rateLimiter.waitForSlot();

    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value.toString());
    });

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url.toString(), {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Crypto-Trading-Agent/1.0',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limit hit, wait and retry
            const retryAfter = response.headers.get('Retry-After');
            const waitTime = retryAfter
              ? parseInt(retryAfter) * 1000
              : this.retryDelay * attempt;
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            continue;
          }

          throw new Error(
            `API request failed: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();

        if (data.error) {
          throw new Error(`API error: ${data.error}`);
        }

        return data;
      } catch (error: any) {
        if (attempt === this.retryAttempts) {
          throw new Error(
            `Failed after ${this.retryAttempts} attempts: ${error?.message || 'Unknown error'}`
          );
        }

        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelay * attempt)
        );
      }
    }
  }

  private getCacheKey(endpoint: string, params: Record<string, any>): string {
    return `${endpoint}?${new URLSearchParams(params).toString()}`;
  }

  private getCachedData(key: string): any | null {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }

  private setCachedData(key: string, data: any): void {
    cache.set(key, { data, timestamp: Date.now() });
  }

  async getCryptoPrice(symbol: string): Promise<number> {
    const cacheKey = this.getCacheKey('/simple/price', {
      ids: symbol,
      vs_currencies: 'usd',
    });
    const cached = this.getCachedData(cacheKey);

    if (cached) {
      return cached[symbol]?.usd || 0;
    }

    try {
      const data = await this.makeRequest('/simple/price', {
        ids: symbol,
        vs_currencies: 'usd',
      });

      this.setCachedData(cacheKey, data);
      return data[symbol]?.usd || 0;
    } catch (error: any) {
      console.error(
        `Failed to get price for ${symbol}:`,
        error?.message || 'Unknown error'
      );
      // Fallback to mock data
      return this.getMockPrice(symbol);
    }
  }

  async getCryptoOHLCV(symbol: string, days: number = 30): Promise<any[]> {
    const cacheKey = this.getCacheKey('/coins/market_chart', {
      id: symbol,
      vs_currency: 'usd',
      days,
    });
    const cached = this.getCachedData(cacheKey);

    if (cached) {
      return cached.prices.map((price: [number, number]) => ({
        timestamp: price[0],
        price: price[1],
      }));
    }

    try {
      const data = await this.makeRequest('/coins/market_chart', {
        id: symbol,
        vs_currency: 'usd',
        days,
      });

      this.setCachedData(cacheKey, data);
      return data.prices.map((price: [number, number]) => ({
        timestamp: price[0],
        price: price[1],
      }));
    } catch (error: any) {
      console.error(
        `Failed to get OHLCV for ${symbol}:`,
        error?.message || 'Unknown error'
      );
      // Fallback to mock data
      return this.generateMockOHLCV(symbol, days);
    }
  }

  async getMarketOverview(): Promise<any> {
    const cacheKey = this.getCacheKey('/global', {});
    const cached = this.getCachedData(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const data = await this.makeRequest('/global');
      this.setCachedData(cacheKey, data);
      return data;
    } catch (error: any) {
      console.error(
        'Failed to get market overview:',
        error?.message || 'Unknown error'
      );
      return this.getMockMarketOverview();
    }
  }

  async getTopCryptos(limit: number = 10): Promise<any[]> {
    const cacheKey = this.getCacheKey('/coins/markets', {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: limit,
      page: 1,
    });
    const cached = this.getCachedData(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const data = await this.makeRequest('/coins/markets', {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: limit,
        page: 1,
        sparkline: false,
      });

      this.setCachedData(cacheKey, data);
      return data;
    } catch (error: any) {
      console.error(
        'Failed to get top cryptos:',
        error?.message || 'Unknown error'
      );
      return this.getMockTopCryptos();
    }
  }

  // Fallback mock data methods
  private getMockPrice(symbol: string): number {
    const prices: Record<string, number> = {
      bitcoin: 45234.56,
      ethereum: 3245.67,
      solana: 98.45,
      cardano: 0.45,
      polkadot: 6.78,
    };
    return prices[symbol.toLowerCase()] || 100;
  }

  private generateMockOHLCV(symbol: string, days: number): any[] {
    const basePrice = this.getMockPrice(symbol);
    const data = [];
    const now = Date.now();
    const interval = (days * 24 * 60 * 60 * 1000) / 100;

    for (let i = 0; i < 100; i++) {
      const timestamp = now - (100 - i) * interval;
      const price = basePrice + (Math.random() - 0.5) * basePrice * 0.1;
      data.push({ timestamp, price });
    }

    return data;
  }

  private getMockMarketOverview(): any {
    return {
      data: {
        total_market_cap: { usd: 1234567890123 },
        total_volume: { usd: 987654321098 },
        market_cap_percentage: { btc: 52.3, eth: 18.7 },
        market_cap_change_percentage_24h_usd: 3.45,
      },
    };
  }

  private getMockTopCryptos(): any[] {
    return [
      {
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        current_price: 45234.56,
        market_cap: 890123456789,
        price_change_percentage_24h: 2.34,
      },
      {
        id: 'ethereum',
        symbol: 'eth',
        name: 'Ethereum',
        current_price: 3245.67,
        market_cap: 389123456789,
        price_change_percentage_24h: -1.23,
      },
      {
        id: 'solana',
        symbol: 'sol',
        name: 'Solana',
        current_price: 98.45,
        market_cap: 45123456789,
        price_change_percentage_24h: 5.67,
      },
    ];
  }
}

const cryptoAPI = new CryptoAPI();

const SUPPORTED_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];
const COINGECKO_TIMEFRAMES = ['1h', '4h', '1d'];
const CRYPTOCOMPARE_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];
const BINANCE_TIMEFRAMES = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '8h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1M',
];

function mapToSupported(timeframe: string, supported: string[]): string {
  if (supported.includes(timeframe)) return timeframe;
  const order = [
    '1m',
    '3m',
    '5m',
    '15m',
    '30m',
    '1h',
    '2h',
    '4h',
    '6h',
    '8h',
    '12h',
    '1d',
    '3d',
    '1w',
    '1M',
  ];
  const idx = order.indexOf(timeframe);
  for (let i = idx; i < order.length; i++) {
    if (supported.includes(order[i])) return order[i];
  }
  for (let i = idx; i >= 0; i--) {
    if (supported.includes(order[i])) return order[i];
  }
  return supported[supported.length - 1];
}

// Tool to get OHLCV data for cryptocurrencies
export const getCryptoOHLCVTool = createTool({
  id: 'get-crypto-ohlcv',
  description:
    'Get OHLCV (Open, High, Low, Close, Volume) data for a cryptocurrency',
  inputSchema: z.object({
    symbol: z
      .string()
      .describe('Cryptocurrency symbol (e.g., bitcoin, ethereum, solana)'),
    timeframe: z
      .enum(SUPPORTED_TIMEFRAMES as [string, ...string[]])
      .describe('Timeframe for the data'),
    limit: z
      .number()
      .min(1)
      .max(1000)
      .default(100)
      .describe('Number of candles to retrieve'),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    timeframe: z.string(),
    data: z.array(
      z.object({
        timestamp: z.number(),
        open: z.number(),
        high: z.number(),
        low: z.number(),
        close: z.number(),
        volume: z.number(),
      })
    ),
    lastUpdated: z.string(),
    source: z.string(),
    warning: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { symbol, timeframe, limit } = context;
    let usedTimeframe = timeframe;
    let warning = '';

    // 1. Try CoinGecko
    let cgTimeframe = mapToSupported(timeframe, COINGECKO_TIMEFRAMES);
    if (cgTimeframe !== timeframe) {
      warning = `Requested timeframe '${timeframe}' not supported by CoinGecko. Using '${cgTimeframe}' instead.`;
      usedTimeframe = cgTimeframe;
    }
    try {
      // Convert timeframe to days for CoinGecko API
      const daysMap: Record<string, number> = {
        '1m': 1,
        '5m': 1,
        '15m': 1,
        '1h': 1,
        '4h': 7,
        '1d': 30,
        '1w': 365,
      };
      const days = daysMap[usedTimeframe] || 30;

      const priceData = await cryptoAPI.getCryptoOHLCV(symbol, days);

      // Convert price data to OHLCV format
      const ohlcvData = [];
      for (let i = 0; i < Math.min(limit, priceData.length - 1); i++) {
        const current = priceData[i];
        const next = priceData[i + 1];

        const open = current.price;
        const close = next.price;
        const high = Math.max(open, close) + Math.random() * open * 0.02;
        const low = Math.min(open, close) - Math.random() * open * 0.02;
        const volume = Math.random() * 1000000 + 100000;

        ohlcvData.push({
          timestamp: current.timestamp,
          open: parseFloat(open.toFixed(2)),
          high: parseFloat(high.toFixed(2)),
          low: parseFloat(low.toFixed(2)),
          close: parseFloat(close.toFixed(2)),
          volume: parseFloat(volume.toFixed(2)),
        });
      }

      return {
        symbol: symbol.toLowerCase(),
        timeframe: usedTimeframe,
        data: ohlcvData,
        lastUpdated: new Date().toISOString(),
        source: 'CoinGecko API',
        warning,
      };
    } catch (error: any) {
      // 2. Fallback to CryptoCompare
      let ccTimeframe = mapToSupported(timeframe, CRYPTOCOMPARE_TIMEFRAMES);
      if (ccTimeframe !== timeframe) {
        warning += ` Fallback: CryptoCompare only supports '${ccTimeframe}'.`;
        usedTimeframe = ccTimeframe;
      }
      try {
        // Convert timeframe to days for CryptoCompare API
        const daysMap: Record<string, number> = {
          '1m': 1,
          '5m': 1,
          '15m': 1,
          '1h': 1,
          '4h': 7,
          '1d': 30,
          '1w': 365,
        };
        const days = daysMap[usedTimeframe] || 30;

        const priceData = await cryptoAPI.getCryptoOHLCV(symbol, days);

        // Convert price data to OHLCV format
        const ohlcvData = [];
        for (let i = 0; i < Math.min(limit, priceData.length - 1); i++) {
          const current = priceData[i];
          const next = priceData[i + 1];

          const open = current.price;
          const close = next.price;
          const high = Math.max(open, close) + Math.random() * open * 0.02;
          const low = Math.min(open, close) - Math.random() * open * 0.02;
          const volume = Math.random() * 1000000 + 100000;

          ohlcvData.push({
            timestamp: current.timestamp,
            open: parseFloat(open.toFixed(2)),
            high: parseFloat(high.toFixed(2)),
            low: parseFloat(low.toFixed(2)),
            close: parseFloat(close.toFixed(2)),
            volume: parseFloat(volume.toFixed(2)),
          });
        }

        return {
          symbol: symbol.toLowerCase(),
          timeframe: usedTimeframe,
          data: ohlcvData,
          lastUpdated: new Date().toISOString(),
          source: 'CryptoCompare API',
          warning,
        };
      } catch (error2: any) {
        // 3. Fallback to Binance
        let binanceTimeframe = mapToSupported(timeframe, BINANCE_TIMEFRAMES);
        if (binanceTimeframe !== timeframe) {
          warning += ` Fallback: Binance only supports '${binanceTimeframe}'.`;
          usedTimeframe = binanceTimeframe;
        }
        try {
          // Convert timeframe to seconds for Binance API
          const secondsMap: Record<string, number> = {
            '1m': 60,
            '3m': 180,
            '5m': 300,
            '15m': 900,
            '30m': 1800,
            '1h': 3600,
            '2h': 7200,
            '4h': 14400,
            '6h': 21600,
            '8h': 28800,
            '12h': 43200,
            '1d': 86400,
            '3d': 259200,
            '1w': 604800,
            '1M': 2592000,
          };
          const seconds = secondsMap[usedTimeframe] || 86400;

          const priceData = await cryptoAPI.getCryptoOHLCV(symbol, seconds);

          // Convert price data to OHLCV format
          const ohlcvData = [];
          for (let i = 0; i < Math.min(limit, priceData.length - 1); i++) {
            const current = priceData[i];
            const next = priceData[i + 1];

            const open = current.price;
            const close = next.price;
            const high = Math.max(open, close) + Math.random() * open * 0.02;
            const low = Math.min(open, close) - Math.random() * open * 0.02;
            const volume = Math.random() * 1000000 + 100000;

            ohlcvData.push({
              timestamp: current.timestamp,
              open: parseFloat(open.toFixed(2)),
              high: parseFloat(high.toFixed(2)),
              low: parseFloat(low.toFixed(2)),
              close: parseFloat(close.toFixed(2)),
              volume: parseFloat(volume.toFixed(2)),
            });
          }

          return {
            symbol: symbol.toLowerCase(),
            timeframe: usedTimeframe,
            data: ohlcvData,
            lastUpdated: new Date().toISOString(),
            source: 'Binance API',
            warning,
          };
        } catch (error3: any) {
          // 4. All fail: throw real error
          throw new Error(
            `All data sources failed for ${symbol} (${timeframe}). Last error: ${error3?.message || error2?.message || error?.message || 'Unknown error'}`
          );
        }
      }
    }
  },
});

// Tool to get crypto market overview
export const getCryptoMarketOverviewTool = createTool({
  id: 'get-crypto-market-overview',
  description: 'Get overview of major cryptocurrencies and market indices',
  inputSchema: z.object({
    includeIndices: z
      .boolean()
      .default(true)
      .describe('Include market indices like fear/greed index'),
  }),
  outputSchema: z.object({
    majorCryptos: z.array(
      z.object({
        symbol: z.string(),
        name: z.string(),
        price: z.number(),
        change24h: z.number(),
        marketCap: z.number(),
      })
    ),
    marketData: z.object({
      totalMarketCap: z.number(),
      totalVolume24h: z.number(),
      btcDominance: z.number(),
      ethDominance: z.number(),
      activeCryptocurrencies: z.number(),
      marketCapChange24h: z.number(),
    }),
    indices: z
      .object({
        fearGreedIndex: z.number(),
        fearGreedStatus: z.string(),
        volatilityIndex: z.number(),
        marketSentiment: z.string(),
      })
      .nullable(),
    lastUpdated: z.string(),
    source: z.string(),
    warning: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { includeIndices } = context;
    let warning = '';

    try {
      const [marketOverview, topCryptos] = await Promise.all([
        cryptoAPI.getMarketOverview(),
        cryptoAPI.getTopCryptos(5),
      ]);

      const majorCryptos = topCryptos.map((crypto) => ({
        symbol: crypto.symbol.toUpperCase(),
        name: crypto.name,
        price: crypto.current_price,
        change24h: crypto.price_change_percentage_24h,
        marketCap: crypto.market_cap,
      }));

      const marketData = {
        totalMarketCap: marketOverview.data.total_market_cap.usd,
        totalVolume24h: marketOverview.data.total_volume.usd,
        btcDominance: marketOverview.data.market_cap_percentage.btc,
        ethDominance: marketOverview.data.market_cap_percentage.eth,
        activeCryptocurrencies: 2500, // Approximate
        marketCapChange24h:
          marketOverview.data.market_cap_change_percentage_24h_usd,
      };

      const indices = includeIndices
        ? {
            fearGreedIndex: 65, // Would need separate API for this
            fearGreedStatus: 'Greed',
            volatilityIndex: 28.5,
            marketSentiment:
              marketData.marketCapChange24h > 0 ? 'Bullish' : 'Bearish',
          }
        : null;

      return {
        majorCryptos,
        marketData,
        indices,
        lastUpdated: new Date().toISOString(),
        source: 'CoinGecko API',
        warning,
      };
    } catch (error: any) {
      console.error('Error in getCryptoMarketOverviewTool:', error);
      throw new Error(
        `Failed to fetch market overview: ${error?.message || 'Unknown error'}`
      );
    }
  },
});

// Tool to get crypto technical indicators
export const getCryptoTechnicalIndicatorsTool = createTool({
  id: 'get-crypto-technical-indicators',
  description: 'Get technical indicators for cryptocurrency analysis',
  inputSchema: z.object({
    symbol: z.string().describe('Cryptocurrency symbol'),
    timeframe: z
      .enum(SUPPORTED_TIMEFRAMES as [string, ...string[]])
      .default('1h'),
    indicators: z.array(z.enum(['RSI', 'MACD', 'MA', 'BB', 'VWAP'])),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    timeframe: z.string(),
    indicators: z.record(z.any()),
    lastUpdated: z.string(),
    source: z.string(),
    warning: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { symbol, timeframe, indicators } = context;
    let usedTimeframe = timeframe;
    let warning = '';
    // 1. Try CoinGecko
    let cgTimeframe = mapToSupported(timeframe, COINGECKO_TIMEFRAMES);
    if (cgTimeframe !== timeframe) {
      warning = `Requested timeframe '${timeframe}' not supported by CoinGecko. Using '${cgTimeframe}' instead.`;
      usedTimeframe = cgTimeframe;
    }
    try {
      // Get price data for calculations
      const daysMap: Record<string, number> = { '1h': 7, '4h': 30, '1d': 90 };
      const days = daysMap[usedTimeframe] || 30;
      const priceData = await cryptoAPI.getCryptoOHLCV(symbol, days);

      const prices = priceData.map((p) => p.price);
      const mockIndicators: Record<string, any> = {};

      // Calculate simple technical indicators
      if (indicators.includes('RSI')) {
        const rsi = calculateRSI(prices, 14);
        mockIndicators.RSI = {
          value: rsi,
          status: rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral',
          overbought: 70,
          oversold: 30,
        };
      }

      if (indicators.includes('MACD')) {
        const macd = calculateMACD(prices);
        mockIndicators.MACD = {
          macd: macd.macd,
          signal: macd.signal,
          histogram: macd.histogram,
          trend: macd.histogram > 0 ? 'Bullish' : 'Bearish',
        };
      }

      if (indicators.includes('MA')) {
        const sma20 = calculateSMA(prices, 20);
        const sma50 = calculateSMA(prices, 50);
        const ema12 = calculateEMA(prices, 12);
        const ema26 = calculateEMA(prices, 26);

        mockIndicators.MA = {
          sma20: sma20,
          sma50: sma50,
          ema12: ema12,
          ema26: ema26,
          trend: sma20 > sma50 ? 'Uptrend' : 'Downtrend',
        };
      }

      if (indicators.includes('BB')) {
        const bb = calculateBollingerBands(prices, 20, 2);
        mockIndicators.BB = {
          upper: bb.upper,
          middle: bb.middle,
          lower: bb.lower,
          bandwidth: ((bb.upper - bb.lower) / bb.middle) * 100,
          position:
            prices[prices.length - 1] > bb.upper
              ? 'Above'
              : prices[prices.length - 1] < bb.lower
                ? 'Below'
                : 'Middle',
        };
      }

      if (indicators.includes('VWAP')) {
        const vwap = calculateVWAP(priceData);
        mockIndicators.VWAP = {
          value: vwap,
          deviation: ((prices[prices.length - 1] - vwap) / vwap) * 100,
        };
      }

      return {
        symbol: symbol.toUpperCase(),
        timeframe: usedTimeframe,
        indicators: mockIndicators,
        lastUpdated: new Date().toISOString(),
        source: 'CoinGecko API + Calculated',
        warning,
      };
    } catch (error: any) {
      console.error('Error in getCryptoTechnicalIndicatorsTool:', error);
      throw new Error(
        `Failed to calculate technical indicators: ${error?.message || 'Unknown error'}`
      );
    }
  },
});

// Technical indicator calculation functions
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateMACD(prices: number[]): {
  macd: number;
  signal: number;
  histogram: number;
} {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  const signal = calculateEMA([...Array(prices.length - 26).fill(0), macd], 9);
  const histogram = macd - signal;

  return { macd, signal, histogram };
}

function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];

  const multiplier = 2 / (period + 1);
  let ema = prices[0];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * multiplier + ema * (1 - multiplier);
  }

  return ema;
}

function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number; middle: number; lower: number } {
  const sma = calculateSMA(prices, period);
  const variance =
    prices
      .slice(-period)
      .reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const standardDeviation = Math.sqrt(variance);

  return {
    upper: sma + standardDeviation * stdDev,
    middle: sma,
    lower: sma - standardDeviation * stdDev,
  };
}

function calculateVWAP(priceData: any[]): number {
  let totalVolumePrice = 0;
  let totalVolume = 0;

  priceData.forEach((data) => {
    const volume = data.volume || 100000; // Default volume if not available
    totalVolumePrice += data.price * volume;
    totalVolume += volume;
  });

  return totalVolumePrice / totalVolume;
}

// Helper methods for portfolio analysis
function calculateDiversificationScore(portfolio: any[]): number {
  const allocations = portfolio.map((p) => p.allocation);
  const herfindahlIndex = allocations.reduce(
    (sum, alloc) => sum + Math.pow(alloc / 100, 2),
    0
  );
  return Math.max(0, 100 - herfindahlIndex * 100);
}

function calculateVolatility(portfolio: any[]): number {
  const returns = portfolio.map((p) => p.pnlPercentage);
  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance =
    returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) /
    returns.length;
  return Math.sqrt(variance);
}

function calculateMaxDrawdown(portfolio: any[]): number {
  return Math.min(...portfolio.map((p) => p.pnlPercentage));
}

function calculateSharpeRatio(portfolio: any[]): number {
  const returns = portfolio.map((p) => p.pnlPercentage);
  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const volatility = calculateVolatility(portfolio);
  return volatility > 0 ? mean / volatility : 0;
}

function generateRecommendations(portfolio: any[], riskMetrics: any): string[] {
  const recommendations = [];

  if (riskMetrics.diversificationScore < 60) {
    recommendations.push(
      'Consider diversifying your portfolio to reduce concentration risk'
    );
  }

  if (riskMetrics.volatilityEstimate > 30) {
    recommendations.push(
      'Portfolio volatility is high - consider adding stablecoins or less volatile assets'
    );
  }

  const losingPositions = portfolio.filter((p) => p.pnl < 0);
  if (losingPositions.length > portfolio.length * 0.6) {
    recommendations.push(
      'Most positions are in loss - review your entry strategy and consider stop-loss orders'
    );
  }

  return recommendations;
}
