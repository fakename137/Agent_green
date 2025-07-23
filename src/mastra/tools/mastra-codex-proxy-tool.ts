import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';

const CODEX_API_URL = 'https://graph.codex.io/graphql';
const CODEX_API_KEY = process.env.CODEX_API_KEY || '';

export const mastraCodexProxyTool = createTool({
  id: 'mastra-codex-proxy',
  description:
    'Proxy tool to forward GraphQL queries to Codex API for frontend interaction',
  inputSchema: z.object({
    query: z.string(),
    variables: z.record(z.any()).optional(),
  }),
  outputSchema: z.object({
    data: z.any(),
    error: z.string().optional(),
  }),
  async execute({ context }) {
    const { query, variables } = context;
    try {
      const res = await axios.post(
        CODEX_API_URL,
        { query, variables },
        {
          headers: {
            Authorization: `Bearer ${CODEX_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return { data: res.data.data };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error('Codex API error:', err.response?.data || err.message);
        return {
          data: null,
          error: JSON.stringify(err.response?.data || err.message),
        };
      }
      return {
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});
