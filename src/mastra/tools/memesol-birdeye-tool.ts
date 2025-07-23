import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const BIRDEYE_API_URL = 'https://public-api.birdeye.so';

export const memesolBirdeyeTool = createTool({
  id: 'memesol-birdeye',
  description: 'Fetch Birdeye data for a given memecoin symbol',
  inputSchema: z.object({ symbol: z.string() }),
  outputSchema: z.object({
    birdeye: z.any(),
    error: z.string().optional(),
  }),
  async execute({ context }) {
    const { symbol } = context;
    try {
      // You may want to map symbol to address here if needed
      const res = await fetch(
        `${BIRDEYE_API_URL}/defi/price?address=${symbol}&include_liquidity=true&ui_amount_mode=raw`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'x-chain': 'solana' },
        }
      );
      if (!res.ok)
        return {
          birdeye: null,
          error: `Failed to fetch Birdeye data: ${res.status}`,
        };
      const birdeye = await res.json();
      return { birdeye };
    } catch (err) {
      return { birdeye: null, error: (err as Error).message };
    }
  },
});
