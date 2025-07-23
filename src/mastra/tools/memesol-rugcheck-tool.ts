import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const RUGCHECK_API_URL = 'https://api.rugcheck.xyz/v1';
const RUGCHECK_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NTM0MDk4NTIsImlkIjoiQzlUeW1HN0VFOVVrV2tiYTFUVzE5UW1MZ3RCOVpWaFpiM0R2YUM1N1VmazMifQ.bqUuG85ynhafu5TYiJU9Mx9ZSw7tuK-DXCtHUOgCYLs';
function getRugCheckAuthHeaders() {
  return {
    Authorization: `Bearer ${RUGCHECK_JWT}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export const memesolRugCheckTool = createTool({
  id: 'memesol-rugcheck',
  description: 'Fetch RugCheck data for a given Solana token address',
  inputSchema: z.object({ address: z.string() }),
  outputSchema: z.object({
    rugCheck: z.any(),
    error: z.string().optional(),
  }),
  async execute({ context }) {
    const { address } = context;
    try {
      const res = await fetch(`${RUGCHECK_API_URL}/tokens/${address}/report`, {
        method: 'GET',
        headers: getRugCheckAuthHeaders(),
      });
      if (!res.ok)
        return {
          rugCheck: null,
          error: `Failed to fetch RugCheck data: ${res.status}`,
        };
      const rugCheck = await res.json();
      return { rugCheck };
    } catch (err) {
      return { rugCheck: null, error: (err as Error).message };
    }
  },
});
