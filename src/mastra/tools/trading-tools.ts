import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';

// ... existing code ...
export const getTokenOHLCVTool = createTool({
  id: 'get-token-ohlcv',
  description:
    'Get OHLCV (Open, High, Low, Close, Volume) data for any token using CoinGecko API',
  inputSchema: z.object({
    tokenAddress: z
      .string()
      .describe('Token contract address (Ethereum only for CoinGecko OHLCV)'),
    timeframe: z
      .enum(['1m', '1h', '1d'])
      .describe('Timeframe for OHLCV data (CoinGecko supports only 1m, 1h, 1d)')
      .default('1h'),
    limit: z
      .number()
      .min(1)
      .max(1000)
      .describe('Number of candles to fetch (1-1000)')
      .default(100),
  }),
  outputSchema: z.object({
    tokenAddress: z.string(),
    symbol: z.string().nullable(),
    timeframe: z.string(),
    candles: z.array(
      z.object({
        timestamp: z.number().describe('Unix timestamp in milliseconds'),
        open: z.number().describe('Opening price'),
        high: z.number().describe('Highest price'),
        low: z.number().describe('Lowest price'),
        close: z.number().describe('Closing price'),
        volume: z.number().describe('Trading volume'),
        datetime: z.string().describe('Human readable datetime'),
      })
    ),
    metadata: z.object({
      totalCandles: z.number(),
      firstCandle: z.string(),
      lastCandle: z.string(),
      priceChange24h: z.number().nullable(),
      volumeChange24h: z.number().nullable(),
    }),
    source: z.string(),
  }),
  async execute({
    context,
    runtimeContext,
  }: {
    context: any;
    runtimeContext: any;
  }) {
    const { tokenAddress, timeframe = '1h', limit = 100 } = context;
    try {
      // 1. Map contract address to CoinGecko coin ID
      const contractResp = await axios.get(
        `https://api.coingecko.com/api/v3/coins/ethereum/contract/${tokenAddress}`
      );
      const coinData = contractResp.data;
      const coinId = coinData.id;
      const symbol = coinData.symbol?.toUpperCase() || null;

      // 2. Fetch OHLC data
      // CoinGecko supports only 1, 7, 14, 30, 90, 180, 365, max days for OHLC, but for /ohlc endpoint, only 1, 7, 14, 30, 90, 180, 365, max days for 1d, and 1 for 1h/1m
      // We'll use 1 for 1h/1m, and limit for 1d (up to 365)
      let days = 1;
      if (timeframe === '1d') {
        days = Math.min(limit, 365);
      }
      // 3. Call CoinGecko OHLC endpoint
      // /coins/{id}/ohlc?vs_currency=usd&days={days}
      const ohlcResp = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc`,
        {
          params: {
            vs_currency: 'sol',
            days,
          },
        }
      );
      const ohlc = ohlcResp.data;
      // ohlc: [ [timestamp, open, high, low, close], ... ]
      // CoinGecko does not provide volume in this endpoint, so we'll set volume to 0
      const candles = ohlc.slice(-limit).map((c: any) => ({
        timestamp: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: 0,
        datetime: new Date(c[0]).toISOString(),
      }));
      // 4. Calculate priceChange24h and volumeChange24h (not available, so set to null)
      return {
        tokenAddress,
        symbol,
        timeframe,
        candles,
        metadata: {
          totalCandles: candles.length,
          firstCandle: candles[0]?.datetime || '',
          lastCandle: candles[candles.length - 1]?.datetime || '',
          priceChange24h: null,
          volumeChange24h: null,
        },
        source: 'CoinGecko API',
      };
    } catch (error: any) {
      throw new Error(
        `Failed to fetch OHLCV data from CoinGecko for token ${tokenAddress}: ${error?.response?.data?.error || error?.message || 'Unknown error'}`
      );
    }
  },
});
// ... existing code ...
