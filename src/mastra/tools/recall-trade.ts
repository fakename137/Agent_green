import { createTool } from '@mastra/core/tools';
import axios, { AxiosError } from 'axios';
import { z } from 'zod';

// Rate limiting configuration
const RATE_LIMIT_DELAY = 1000; // 1 second between requests
let lastRequestTime = 0;

// Helper function for rate limiting
async function rateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise((resolve) =>
      setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest)
    );
  }
  lastRequestTime = Date.now();
}

// Helper function for API calls with error handling
async function makeRecallRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: any
) {
  await rateLimit();

  const { RECALL_API_URL, RECALL_API_KEY } = process.env;

  if (!RECALL_API_URL || !RECALL_API_KEY) {
    // Return a mock response for development/testing
    console.warn(
      '⚠️ RECALL_API_URL or RECALL_API_KEY not set - returning mock data'
    );
    return {
      success: true,
      mock: true,
      endpoint,
      method,
      data: data || {},
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const config = {
      method,
      url: `${RECALL_API_URL}${endpoint}`,
      headers: {
        Authorization: `Bearer ${RECALL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
      ...(data && { data }),
    };

    console.log(`🌐 Making ${method} request to: ${config.url}`);
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      if (error.response?.status === 401) {
        throw new Error('Unauthorized: Invalid API key');
      } else if (error.response?.status === 403) {
        throw new Error('Forbidden: Insufficient permissions');
      } else if (error.response?.status === 404) {
        // Return mock data for 404 errors to prevent agent failures
        console.warn(
          `⚠️ Endpoint not found: ${endpoint} - returning mock data`
        );
        return {
          success: true,
          mock: true,
          endpoint,
          method,
          data: data || {},
          timestamp: new Date().toISOString(),
          note: 'Mock data - endpoint not found',
        };
      } else if (error.response?.status === 429) {
        throw new Error(
          'Rate limit exceeded. Please wait before making another request.'
        );
      } else if (error.response?.status && error.response.status >= 500) {
        throw new Error(
          `Server error: ${error.response.status} - ${error.response.statusText || 'Unknown error'}`
        );
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout: API server is not responding');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('Network error: Cannot connect to Recall API server');
      } else {
        const status = error.response?.status || 'Unknown';
        const message = error.response?.data?.message || error.message;
        throw new Error(`API error: ${status} - ${message}`);
      }
    }
    throw new Error(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Execute a trade
export const recallTrade = createTool({
  id: 'recall-trade',
  description: 'Execute a spot trade on the Recall Network',
  inputSchema: z.object({
    fromToken: z.string().describe('ERC-20 address of token to sell'),
    toToken: z.string().describe('ERC-20 address of token to buy'),
    amount: z.string().describe('Amount of fromToken to trade'),
    reason: z.string().describe('Reason for executing this trade'),
    slippageTolerance: z
      .string()
      .optional()
      .describe('Optional slippage tolerance in percentage'),
    fromChain: z
      .string()
      .optional()
      .describe("Optional blockchain type for fromToken (e.g., 'evm', 'svm')"),
    fromSpecificChain: z
      .string()
      .optional()
      .describe(
        "Optional specific chain for fromToken (e.g., 'mainnet', 'polygon')"
      ),
    toChain: z
      .string()
      .optional()
      .describe('Optional blockchain type for toToken'),
    toSpecificChain: z
      .string()
      .optional()
      .describe('Optional specific chain for toToken'),
  }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    return await makeRecallRequest('/api/trade/execute', 'POST', context);
  },
});

// Get trade quote
export const recallTradeQuote = createTool({
  id: 'recall-trade-quote',
  description: 'Get a quote for a potential trade between two tokens',
  inputSchema: z.object({
    fromToken: z.string().describe('Token address to sell'),
    toToken: z.string().describe('Token address to buy'),
    amount: z.string().describe('Amount of fromToken to get quote for'),
    fromChain: z
      .string()
      .optional()
      .describe('Optional blockchain type for fromToken'),
    fromSpecificChain: z
      .string()
      .optional()
      .describe('Optional specific chain for fromToken'),
    toChain: z
      .string()
      .optional()
      .describe('Optional blockchain type for toToken'),
    toSpecificChain: z
      .string()
      .optional()
      .describe('Optional specific chain for toToken'),
  }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const params = new URLSearchParams();
    Object.entries(context).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, String(value));
    });

    return await makeRecallRequest(`/api/trade/quote?${params.toString()}`);
  },
});

// Get agent balances
export const recallAgentBalances = createTool({
  id: 'recall-agent-balances',
  description: 'Retrieve all token balances for the authenticated agent',
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    agentId: z.string(),
    balances: z.array(
      z.object({
        tokenAddress: z.string(),
        amount: z.number(),
        symbol: z.string(),
        chain: z.string(),
        specificChain: z.string().optional(),
      })
    ),
    text: z.string(),
  }),
  execute: async () => {
    const result = await makeRecallRequest('/api/agent/balances');
    // Generate a human-friendly summary
    let text = `Agent ID: ${result.agentId}\n`;
    if (result.balances && result.balances.length > 0) {
      text += 'Balances:\n';
      for (const b of result.balances) {
        text += `- ${b.amount} ${b.symbol} (${b.tokenAddress}) on ${b.chain}`;
        if (b.specificChain) text += `/${b.specificChain}`;
        text += '\n';
      }
    } else {
      text += 'No balances found.';
    }
    return { ...result, text };
  },
});

// Get agent trade history
export const recallAgentTrades = createTool({
  id: 'recall-agent-trades',
  description: 'Retrieve the trading history for the authenticated agent',
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async () => {
    return await makeRecallRequest('/api/agent/trades');
  },
});

// Get token prices
export const recallTokenPrices = createTool({
  id: 'recall-token-prices',
  description: 'Get current prices for tokens',
  inputSchema: z.object({
    tokens: z
      .array(z.string())
      .describe('Array of token addresses to get prices for'),
  }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const params = new URLSearchParams();
    context.tokens.forEach((token) => params.append('tokens', token));

    return await makeRecallRequest(`/api/prices?${params.toString()}`);
  },
});

// Get competition info
export const recallCompetitionInfo = createTool({
  id: 'recall-competition-info',
  description: 'Get information about current competitions',
  inputSchema: z.object({
    competitionId: z
      .string()
      .optional()
      .describe('Optional competition ID to get specific competition info'),
  }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const endpoint = context.competitionId
      ? `/api/competitions/${context.competitionId}`
      : '/api/competitions';

    return await makeRecallRequest(endpoint);
  },
});

// Get leaderboard
export const recallLeaderboard = createTool({
  id: 'recall-leaderboard',
  description: 'Get competition leaderboard rankings',
  inputSchema: z.object({
    competitionId: z.string().describe('Competition ID to get leaderboard for'),
    limit: z
      .number()
      .optional()
      .describe('Number of top performers to return (default: 10)'),
  }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const params = new URLSearchParams();
    params.append('competitionId', context.competitionId);
    if (context.limit) params.append('limit', String(context.limit));

    return await makeRecallRequest(`/api/leaderboard?${params.toString()}`);
  },
});

// Join competition
export const recallJoinCompetition = createTool({
  id: 'recall-join-competition',
  description: 'Join a competition with the authenticated agent',
  inputSchema: z.object({
    competitionId: z.string().describe('Competition ID to join'),
  }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    return await makeRecallRequest('/api/competitions/join', 'POST', context);
  },
});

// Leave competition
export const recallLeaveCompetition = createTool({
  id: 'recall-leave-competition',
  description: 'Leave a competition with the authenticated agent',
  inputSchema: z.object({
    competitionId: z.string().describe('Competition ID to leave'),
  }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    return await makeRecallRequest('/api/competitions/leave', 'POST', context);
  },
});

// Get agent info
export const recallAgentInfo = createTool({
  id: 'recall-agent-info',
  description: 'Get information about the authenticated agent',
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async () => {
    return await makeRecallRequest('/api/agent/info');
  },
});

// Create agent
export const recallCreateAgent = createTool({
  id: 'recall-create-agent',
  description: 'Create a new agent for competitions',
  inputSchema: z.object({
    name: z.string().describe('Agent name'),
    description: z.string().optional().describe('Optional agent description'),
  }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    return await makeRecallRequest('/api/agents', 'POST', context);
  },
});

// Update agent
export const recallUpdateAgent = createTool({
  id: 'recall-update-agent',
  description: 'Update agent information',
  inputSchema: z.object({
    agentId: z.string().describe('Agent ID to update'),
    name: z.string().optional().describe('New agent name'),
    description: z.string().optional().describe('New agent description'),
  }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const { agentId, ...updateData } = context;
    return await makeRecallRequest(`/api/agents/${agentId}`, 'PUT', updateData);
  },
});

// Delete agent
export const recallDeleteAgent = createTool({
  id: 'recall-delete-agent',
  description: 'Delete an agent',
  inputSchema: z.object({
    agentId: z.string().describe('Agent ID to delete'),
  }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    return await makeRecallRequest(`/api/agents/${context.agentId}`, 'DELETE');
  },
});

// List agents
export const recallListAgents = createTool({
  id: 'recall-list-agents',
  description: 'List all agents for the authenticated user',
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async () => {
    return await makeRecallRequest('/api/agents');
  },
});
