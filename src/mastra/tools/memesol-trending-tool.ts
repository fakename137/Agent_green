import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const RUGCHECK_API_URL = 'https://api.rugcheck.xyz/v1';
const RUGCHECK_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NTMyOTU1NzAsImlkIjoiQUNpaGpmMVNRNmNtZzNqSnlwZ3k4bm5udmJDV3l5RUtjSFBhcUM1NVNKcUwifQ.8jtpV4WnaBWvHFClcZwH2-taSmjACaJ2HWaLd5x4FTY';
function getRugCheckAuthHeaders() {
  return {
    Authorization: `Bearer ${RUGCHECK_JWT}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

const DEXSCREENER_API_URL = 'https://api.dexscreener.com';

export const memesolTrendingTool = createTool({
  id: 'memesol-trending',
  description: 'Fetch trending Solana memecoins from RugCheck',
  inputSchema: z.object({}),
  outputSchema: z.object({
    tokens: z.array(z.any()),
    error: z.string().optional(),
  }),
  async execute() {
    try {
      const res = await fetch(`${RUGCHECK_API_URL}/stats/trending`, {
        method: 'GET',
        headers: getRugCheckAuthHeaders(),
      });
      if (!res.ok)
        return {
          tokens: [],
          error: `Failed to fetch trending tokens: ${res.status}`,
        };
      const tokens = await res.json();
      return { tokens };
    } catch (err) {
      return { tokens: [], error: (err as Error).message };
    }
  },
});

export const memesolDexScreenerTool = createTool({
  id: 'memesol-dexscreener',
  description: 'Fetch trending Solana memecoins from DexScreener',
  inputSchema: z.object({}),
  outputSchema: z.object({
    tokens: z.array(z.any()),
    error: z.string().optional(),
  }),
  async execute() {
    try {
      // Fetch both top and latest trending tokens
      const [topRes, latestRes] = await Promise.all([
        fetch(`${DEXSCREENER_API_URL}/token-boosts/top/v1`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch(`${DEXSCREENER_API_URL}/token-boosts/latest/v1`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }),
      ]);
      if (!topRes.ok || !latestRes.ok) {
        return {
          tokens: [],
          error: 'Failed to fetch trending tokens from DexScreener',
        };
      }
      const topTokens = await topRes.json();
      const latestTokens = await latestRes.json();
      // Combine, deduplicate, and filter for Solana tokens
      const allTokens = [...topTokens, ...latestTokens];
      const uniqueTokens = allTokens.filter(
        (token, idx, self) =>
          idx === self.findIndex((t) => t.tokenAddress === token.tokenAddress)
      );
      const solanaTokens = uniqueTokens.filter(
        (token) => token.chainId === 'solana'
      );
      return { tokens: solanaTokens };
    } catch (err) {
      return { tokens: [], error: (err as Error).message };
    }
  },
});

export const memesolDexScreenerSearchTool = createTool({
  id: 'memesol-dexscreener-search',
  description: 'Search DexScreener for a specific token or query',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({
    results: z.array(z.any()),
    error: z.string().optional(),
  }),
  async execute({ context }) {
    const { query } = context;
    try {
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      if (!res.ok)
        return {
          results: [],
          error: `Failed to search DexScreener: ${res.status}`,
        };
      const data = await res.json();
      return { results: data.pairs || [] };
    } catch (err) {
      return { results: [], error: (err as Error).message };
    }
  },
});
