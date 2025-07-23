import { z } from 'zod';

// Production Configuration Schema
const configSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  
  // API Configuration
  RECALL_API_URL: z.string().url(),
  RECALL_API_KEY: z.string().min(1),
  GAIA_API_URL: z.string().url(),
  
  // Trading Configuration
  TRADING: z.object({
    MAX_DAILY_LOSS: z.number().positive().default(1000), // Max $1000 daily loss
    MAX_POSITION_SIZE: z.number().positive().default(500), // Max $500 per position
    MAX_CONCURRENT_TRADES: z.number().int().positive().default(10),
    PROFIT_MULTIPLIER: z.number().positive().default(1.5),
    STOP_LOSS_MULTIPLIER: z.number().positive().default(0.8), // 20% stop loss
    COOL_DOWN_PERIOD: z.number().int().positive().default(300), // 5 minutes between trades
    
    // Slippage Configuration
    SLIPPAGE_BUY: z.string().default('1'),
    SLIPPAGE_SELL: z.string().default('2'),
    
    // Investment Amounts by Risk Level
    INVESTMENT_AMOUNTS: z.object({
      LOW_RISK: z.number().positive().default(300),
      MODERATE_RISK: z.number().positive().default(150),
      HIGH_RISK: z.number().positive().default(100),
    }),
  }),
  
  // Risk Management
  RISK_MANAGEMENT: z.object({
    MIN_LIQUIDITY: z.number().positive().default(10000),
    MIN_MARKET_CAP: z.number().positive().default(100000),
    MIN_HOLDERS: z.number().int().positive().default(100),
    MIN_RUGCHECK_SCORE: z.number().min(0).max(100).default(40),
    MAX_WHALE_PERCENTAGE: z.number().min(0).max(100).default(20),
    BLACKLISTED_TOKENS: z.array(z.string()).default([]),
  }),
  
  // Data Sources
  DATA_SOURCES: z.object({
    MAX_TOKENS_PER_SOURCE: z.number().int().positive().default(20),
    TIMEOUT_MS: z.number().int().positive().default(30000),
    RETRY_ATTEMPTS: z.number().int().positive().default(3),
    RETRY_DELAY_MS: z.number().int().positive().default(1000),
  }),
  
  // Monitoring & Alerting
  MONITORING: z.object({
    WEBHOOK_URL: z.string().url().optional(),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    ENABLE_METRICS: z.boolean().default(true),
    ENABLE_ALERTS: z.boolean().default(true),
  }),
  
  // Database
  DATABASE: z.object({
    URL: z.string().min(1),
    MAX_CONNECTIONS: z.number().int().positive().default(10),
    QUERY_TIMEOUT: z.number().int().positive().default(30000),
  }),
});

export type Config = z.infer<typeof configSchema>;

// Load and validate configuration
export function loadConfig(): Config {
  const rawConfig = {
    NODE_ENV: process.env.NODE_ENV,
    RECALL_API_URL: process.env.RECALL_API_URL,
    RECALL_API_KEY: process.env.RECALL_API_KEY,
    GAIA_API_URL: process.env.GAIA_API_URL,
    
    TRADING: {
      MAX_DAILY_LOSS: Number(process.env.MAX_DAILY_LOSS),
      MAX_POSITION_SIZE: Number(process.env.MAX_POSITION_SIZE),
      MAX_CONCURRENT_TRADES: Number(process.env.MAX_CONCURRENT_TRADES),
      PROFIT_MULTIPLIER: Number(process.env.PROFIT_MULTIPLIER),
      STOP_LOSS_MULTIPLIER: Number(process.env.STOP_LOSS_MULTIPLIER),
      COOL_DOWN_PERIOD: Number(process.env.COOL_DOWN_PERIOD),
      SLIPPAGE_BUY: process.env.SLIPPAGE_BUY,
      SLIPPAGE_SELL: process.env.SLIPPAGE_SELL,
      INVESTMENT_AMOUNTS: {
        LOW_RISK: Number(process.env.LOW_RISK_AMOUNT),
        MODERATE_RISK: Number(process.env.MODERATE_RISK_AMOUNT),
        HIGH_RISK: Number(process.env.HIGH_RISK_AMOUNT),
      },
    },
    
    RISK_MANAGEMENT: {
      MIN_LIQUIDITY: Number(process.env.MIN_LIQUIDITY),
      MIN_MARKET_CAP: Number(process.env.MIN_MARKET_CAP),
      MIN_HOLDERS: Number(process.env.MIN_HOLDERS),
      MIN_RUGCHECK_SCORE: Number(process.env.MIN_RUGCHECK_SCORE),
      MAX_WHALE_PERCENTAGE: Number(process.env.MAX_WHALE_PERCENTAGE),
      BLACKLISTED_TOKENS: process.env.BLACKLISTED_TOKENS?.split(',') || [],
    },
    
    DATA_SOURCES: {
      MAX_TOKENS_PER_SOURCE: Number(process.env.MAX_TOKENS_PER_SOURCE),
      TIMEOUT_MS: Number(process.env.DATA_SOURCE_TIMEOUT_MS),
      RETRY_ATTEMPTS: Number(process.env.RETRY_ATTEMPTS),
      RETRY_DELAY_MS: Number(process.env.RETRY_DELAY_MS),
    },
    
    MONITORING: {
      WEBHOOK_URL: process.env.WEBHOOK_URL,
      LOG_LEVEL: process.env.LOG_LEVEL,
      ENABLE_METRICS: process.env.ENABLE_METRICS !== 'false',
      ENABLE_ALERTS: process.env.ENABLE_ALERTS !== 'false',
    },
    
    DATABASE: {
      URL: process.env.DATABASE_URL || 'file:./mastra.db',
      MAX_CONNECTIONS: Number(process.env.DB_MAX_CONNECTIONS),
      QUERY_TIMEOUT: Number(process.env.DB_QUERY_TIMEOUT),
    },
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    throw new Error('Invalid configuration. Check environment variables.');
  }
}

export const config = loadConfig();
