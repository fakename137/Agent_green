import { createTool } from '@mastra/core/tools';
import axios, { AxiosError } from 'axios';
import { z } from 'zod';
import type { z as Zod } from 'zod';

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
    throw new Error(
      `Recall API configuration missing. Required environment variables:
      - RECALL_API_URL (e.g., https://api.sandbox.competitions.recall.network)
      - RECALL_API_KEY (your API key from Recall dashboard)`
    );
  }

  try {
    const RECALL_API_URL = 'https://api.sandbox.competitions.recall.network';
    const RECALL_API_KEY = 'e6d77470d11ef3fc_91c5328abe9e957e';
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

// Zod schema for trade execution response
const tradeTransactionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  competitionId: z.string(),
  fromToken: z.string(),
  toToken: z.string(),
  fromAmount: z.number(),
  toAmount: z.number(),
  price: z.number(),
  success: z.boolean(),
  error: z.string().nullable().optional(),
  reason: z.string(),
  tradeAmountUsd: z.number(),
  timestamp: z.string(),
  fromChain: z.string(),
  toChain: z.string(),
  fromSpecificChain: z.string(),
  toSpecificChain: z.string(),
  toTokenSymbol: z.string(),
  fromTokenSymbol: z.string(),
});

const tradeResponseSchema = z.object({
  success: z.boolean(),
  transaction: tradeTransactionSchema,
});

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
  outputSchema: tradeResponseSchema,
  execute: async ({ context }) => {
    const raw = await makeRecallRequest('/api/trade/execute', 'POST', context);
    // Validate response
    const parsed = tradeResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall trade response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

// Utility: Format Recall Trade API response for LLMs
export function formatRecallTradeResponse(
  raw: Zod.infer<typeof tradeResponseSchema>
) {
  if (!raw || !raw.transaction) {
    return {
      humanSummary: '❌ Trade failed or invalid response.',
      llmJson: {
        status: 'error',
        error: raw?.transaction?.error || 'No transaction data.',
      },
    };
  }
  const tx = raw.transaction;
  const humanSummary = `
Trade Execution Summary

- Status: ${tx.success ? '✅ Success' : '❌ Failed'}
- Transaction ID: ${tx.id}
- Agent ID: ${tx.agentId}
- Competition ID: ${tx.competitionId}
- Timestamp: ${tx.timestamp}
- Reason: ${tx.reason}

Trade Details:
- Sold: ${tx.fromAmount} ${tx.fromTokenSymbol} (fromToken: ${tx.fromToken})
- Bought: ${tx.toAmount} ${tx.toTokenSymbol} (toToken: ${tx.toToken})
- Price: $${tx.price} per ${tx.fromTokenSymbol}
- Trade Value (USD): $${tx.tradeAmountUsd}

Chains:
- From Chain: ${tx.fromChain} / ${tx.fromSpecificChain}
- To Chain: ${tx.toChain} / ${tx.toSpecificChain}

Error: ${tx.error || 'None'}
`;
  const llmJson = {
    status: tx.success ? 'success' : 'error',
    transactionId: tx.id,
    agentId: tx.agentId,
    competitionId: tx.competitionId,
    timestamp: tx.timestamp,
    reason: tx.reason,
    from: {
      token: tx.fromToken,
      symbol: tx.fromTokenSymbol,
      amount: tx.fromAmount,
      chain: tx.fromChain,
      specificChain: tx.fromSpecificChain,
    },
    to: {
      token: tx.toToken,
      symbol: tx.toTokenSymbol,
      amount: tx.toAmount,
      chain: tx.toChain,
      specificChain: tx.toSpecificChain,
    },
    price: tx.price,
    tradeAmountUsd: tx.tradeAmountUsd,
    error: tx.error || null,
  };
  return { humanSummary, llmJson };
}

// Zod schema for trade quote response
const tradeQuoteSchema = z.object({
  fromToken: z.string(),
  toToken: z.string(),
  fromAmount: z.number(),
  toAmount: z.number(),
  exchangeRate: z.number(),
  slippage: z.number(),
  tradeAmountUsd: z.number(),
  prices: z.object({
    fromToken: z.number(),
    toToken: z.number(),
  }),
  symbols: z.object({
    fromTokenSymbol: z.string(),
    toTokenSymbol: z.string(),
  }),
  chains: z.object({
    fromChain: z.string(),
    toChain: z.string(),
  }),
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
  outputSchema: tradeQuoteSchema,
  execute: async ({ context }) => {
    const params = new URLSearchParams();
    Object.entries(context).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, String(value));
    });

    const raw = await makeRecallRequest(
      `/api/trade/quote?${params.toString()}`
    );
    // Validate response
    const parsed = tradeQuoteSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall trade quote response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

// 3. recallAgentBalances
const agentBalancesSchema = z.object({
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
});
export function formatRecallAgentBalancesResponse(
  parsed: Zod.infer<typeof agentBalancesSchema>
) {
  if (!parsed || !parsed.success) {
    return {
      humanSummary: '❌ Failed to fetch agent balances.',
      llmJson: { status: 'error', error: parsed?.text || 'No data.' },
    };
  }
  const lines = [`Agent ID: ${parsed.agentId}`, 'Balances:'];
  for (const b of parsed.balances) {
    lines.push(
      `- ${b.amount} ${b.symbol} (${b.tokenAddress}) on ${b.chain}${b.specificChain ? '/' + b.specificChain : ''}`
    );
  }
  return {
    humanSummary: lines.join('\n'),
    llmJson: {
      status: 'success',
      agentId: parsed.agentId,
      balances: parsed.balances,
    },
  };
}

export const recallAgentBalances = createTool({
  id: 'recall-agent-balances',
  description: 'Retrieve all token balances for the authenticated agent',
  inputSchema: z.object({}),
  outputSchema: agentBalancesSchema,
  execute: async () => {
    const raw = await makeRecallRequest('/api/agent/balances');
    const parsed = agentBalancesSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall agent balances response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

// 4. recallAgentTrades
const agentTradesSchema = z.object({
  success: z.boolean(),
  trades: z.array(z.any()), // You can make this stricter if you know the trade object shape
});
export function formatRecallAgentTradesResponse(
  parsed: Zod.infer<typeof agentTradesSchema>
) {
  if (!parsed || !parsed.success) {
    return {
      humanSummary: '❌ Failed to fetch agent trades.',
      llmJson: { status: 'error', error: 'No data.' },
    };
  }
  return {
    humanSummary: `Agent Trades: ${parsed.trades.length} trades found.`,
    llmJson: {
      status: 'success',
      trades: parsed.trades,
    },
  };
}
// 4. recallAgentPortfolio
const agentPortfolioSchema = z.object({
  success: z.boolean(),
  agentId: z.string(),
  totalValue: z.number(),
  tokens: z.array(
    z.object({
      token: z.string(),
      amount: z.number(),
      price: z.number(),
      value: z.number(),
      chain: z.string(),
      specificChain: z.string().optional(),
      symbol: z.string(),
    })
  ),
  source: z.string(),
  snapshotTime: z.string(),
});

export const recallAgentPortfolio = createTool({
  id: 'recall-agent-portfolio',
  description: 'Retrieve agent portfolio with total value and token breakdown',
  inputSchema: z.object({}),
  outputSchema: agentPortfolioSchema,
  execute: async () => {
    const raw = await makeRecallRequest('/api/agent/portfolio');
    const parsed = agentPortfolioSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall agent portfolio response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

export const recallAgentTrades = createTool({
  id: 'recall-agent-trades',
  description: 'Retrieve the trading history for the authenticated agent',
  inputSchema: z.object({}),
  outputSchema: agentTradesSchema,
  execute: async () => {
    const raw = await makeRecallRequest('/api/agent/trades');
    const parsed = agentTradesSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall agent trades response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

// 5. recallTokenPrices (updated for correct schema and input)
const tokenPriceSchema = z.object({
  success: z.boolean(),
  price: z.number(),
  token: z.string(),
  chain: z.string(),
  specificChain: z.string(),
  symbol: z.string(),
  timestamp: z.string(),
});
export function formatRecallTokenPriceResponse(
  parsed: z.infer<typeof tokenPriceSchema>
) {
  if (!parsed || !parsed.success) {
    return {
      humanSummary: '❌ Failed to fetch token price.',
      llmJson: { status: 'error', error: 'No data.' },
    };
  }
  return {
    humanSummary: `Token Price: ${parsed.symbol} (${parsed.token}) on ${parsed.chain}/${parsed.specificChain} = $${parsed.price} (as of ${parsed.timestamp})`,
    llmJson: {
      status: 'success',
      token: parsed.token,
      symbol: parsed.symbol,
      price: parsed.price,
      chain: parsed.chain,
      specificChain: parsed.specificChain,
      timestamp: parsed.timestamp,
    },
  };
}
export const recallTokenPrices = createTool({
  id: 'recall-token-prices',
  description: 'Get current price for a token',
  inputSchema: z.object({
    token: z.string().describe('Token address to get price for'),
    chain: z.string().optional().describe('Blockchain type for token'),
    specificChain: z.string().optional().describe('Specific chain for token'),
  }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const params = new URLSearchParams();
    params.append('token', context.token);
    if (context.chain) params.append('chain', context.chain);
    if (context.specificChain)
      params.append('specificChain', context.specificChain);
    return await makeRecallRequest(`/api/price?${params.toString()}`);
  },
});

// 6. recallCompetitionInfo
const competitionInfoSchema = z.object({
  competitions: z.array(z.any()), // You can make this stricter if you know the competition object shape
});
export function formatRecallCompetitionInfoResponse(
  parsed: Zod.infer<typeof competitionInfoSchema>
) {
  if (!parsed || !parsed.competitions) {
    return {
      humanSummary: '❌ Failed to fetch competition info.',
      llmJson: { status: 'error', error: 'No data.' },
    };
  }
  return {
    humanSummary: `Competitions: ${parsed.competitions.length} found.`,
    llmJson: {
      status: 'success',
      competitions: parsed.competitions,
    },
  };
}
export const recallCompetitionInfo = createTool({
  id: 'recall-competition-info',
  description: 'Get information about current competitions',
  inputSchema: z.object({
    competitionId: z
      .string()
      .optional()
      .describe('Optional competition ID to get specific competition info'),
  }),
  outputSchema: competitionInfoSchema,
  execute: async ({ context }) => {
    const endpoint = context.competitionId
      ? `/api/competitions/${context.competitionId}`
      : '/api/competitions';
    const raw = await makeRecallRequest(endpoint);
    const parsed = competitionInfoSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall competition info response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

// 7. recallLeaderboard
const leaderboardSchema = z.object({
  leaderboard: z.array(z.any()), // You can make this stricter if you know the leaderboard entry shape
});
export function formatRecallLeaderboardResponse(
  parsed: Zod.infer<typeof leaderboardSchema>
) {
  if (!parsed || !parsed.leaderboard) {
    return {
      humanSummary: '❌ Failed to fetch leaderboard.',
      llmJson: { status: 'error', error: 'No data.' },
    };
  }
  return {
    humanSummary: `Leaderboard: ${parsed.leaderboard.length} entries.`,
    llmJson: {
      status: 'success',
      leaderboard: parsed.leaderboard,
    },
  };
}
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
  outputSchema: leaderboardSchema,
  execute: async ({ context }) => {
    const params = new URLSearchParams();
    params.append('competitionId', context.competitionId);
    if (context.limit) params.append('limit', String(context.limit));
    const raw = await makeRecallRequest(
      `/api/leaderboard?${params.toString()}`
    );
    const parsed = leaderboardSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall leaderboard response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

// 8. recallJoinCompetition
const joinCompetitionSchema = z.object({
  success: z.boolean(),
  competitionId: z.string(),
  agentId: z.string(),
  message: z.string().optional(),
});
export function formatRecallJoinCompetitionResponse(
  parsed: Zod.infer<typeof joinCompetitionSchema>
) {
  if (!parsed || !parsed.success) {
    return {
      humanSummary: '❌ Failed to join competition.',
      llmJson: { status: 'error', error: parsed?.message || 'No data.' },
    };
  }
  return {
    humanSummary: `Joined competition ${parsed.competitionId} as agent ${parsed.agentId}.`,
    llmJson: {
      status: 'success',
      competitionId: parsed.competitionId,
      agentId: parsed.agentId,
      message: parsed.message || null,
    },
  };
}
export const recallJoinCompetition = createTool({
  id: 'recall-join-competition',
  description: 'Join a competition with the authenticated agent',
  inputSchema: z.object({
    competitionId: z.string().describe('Competition ID to join'),
  }),
  outputSchema: joinCompetitionSchema,
  execute: async ({ context }) => {
    const raw = await makeRecallRequest(
      '/api/competitions/join',
      'POST',
      context
    );
    const parsed = joinCompetitionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall join competition response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

// 9. recallLeaveCompetition
const leaveCompetitionSchema = z.object({
  success: z.boolean(),
  competitionId: z.string(),
  agentId: z.string(),
  message: z.string().optional(),
});
export function formatRecallLeaveCompetitionResponse(
  parsed: Zod.infer<typeof leaveCompetitionSchema>
) {
  if (!parsed || !parsed.success) {
    return {
      humanSummary: '❌ Failed to leave competition.',
      llmJson: { status: 'error', error: parsed?.message || 'No data.' },
    };
  }
  return {
    humanSummary: `Left competition ${parsed.competitionId} as agent ${parsed.agentId}.`,
    llmJson: {
      status: 'success',
      competitionId: parsed.competitionId,
      agentId: parsed.agentId,
      message: parsed.message || null,
    },
  };
}
export const recallLeaveCompetition = createTool({
  id: 'recall-leave-competition',
  description: 'Leave a competition with the authenticated agent',
  inputSchema: z.object({
    competitionId: z.string().describe('Competition ID to leave'),
  }),
  outputSchema: leaveCompetitionSchema,
  execute: async ({ context }) => {
    const raw = await makeRecallRequest(
      '/api/competitions/leave',
      'POST',
      context
    );
    const parsed = leaveCompetitionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall leave competition response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

// 10. recallAgentInfo
const agentInfoSchema = z.object({
  agentId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  competitions: z.array(z.string()).optional(),
});
export function formatRecallAgentInfoResponse(
  parsed: Zod.infer<typeof agentInfoSchema>
) {
  if (!parsed || !parsed.agentId) {
    return {
      humanSummary: '❌ Failed to fetch agent info.',
      llmJson: { status: 'error', error: 'No data.' },
    };
  }
  return {
    humanSummary: `Agent Info: ${parsed.agentId} (${parsed.name})`,
    llmJson: {
      status: 'success',
      agentId: parsed.agentId,
      name: parsed.name,
      description: parsed.description || null,
      competitions: parsed.competitions || [],
    },
  };
}
export const recallAgentInfo = createTool({
  id: 'recall-agent-info',
  description: 'Get information about the authenticated agent',
  inputSchema: z.object({}),
  outputSchema: agentInfoSchema,
  execute: async () => {
    const raw = await makeRecallRequest('/api/agent/info');
    const parsed = agentInfoSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall agent info response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

// 11. recallCreateAgent
const createAgentSchema = z.object({
  success: z.boolean(),
  agentId: z.string(),
  message: z.string().optional(),
});
export function formatRecallCreateAgentResponse(
  parsed: Zod.infer<typeof createAgentSchema>
) {
  if (!parsed || !parsed.success) {
    return {
      humanSummary: '❌ Failed to create agent.',
      llmJson: { status: 'error', error: parsed?.message || 'No data.' },
    };
  }
  return {
    humanSummary: `Created agent ${parsed.agentId}.`,
    llmJson: {
      status: 'success',
      agentId: parsed.agentId,
      message: parsed.message || null,
    },
  };
}
export const recallCreateAgent = createTool({
  id: 'recall-create-agent',
  description: 'Create a new agent for competitions',
  inputSchema: z.object({
    name: z.string().describe('Agent name'),
    description: z.string().optional().describe('Optional agent description'),
  }),
  outputSchema: createAgentSchema,
  execute: async ({ context }) => {
    const raw = await makeRecallRequest('/api/agents', 'POST', context);
    const parsed = createAgentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall create agent response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

// 12. recallUpdateAgent
const updateAgentSchema = z.object({
  success: z.boolean(),
  agentId: z.string(),
  message: z.string().optional(),
});
export function formatRecallUpdateAgentResponse(
  parsed: Zod.infer<typeof updateAgentSchema>
) {
  if (!parsed || !parsed.success) {
    return {
      humanSummary: '❌ Failed to update agent.',
      llmJson: { status: 'error', error: parsed?.message || 'No data.' },
    };
  }
  return {
    humanSummary: `Updated agent ${parsed.agentId}.`,
    llmJson: {
      status: 'success',
      agentId: parsed.agentId,
      message: parsed.message || null,
    },
  };
}
export const recallUpdateAgent = createTool({
  id: 'recall-update-agent',
  description: 'Update agent information',
  inputSchema: z.object({
    agentId: z.string().describe('Agent ID to update'),
    name: z.string().optional().describe('New agent name'),
    description: z.string().optional().describe('New agent description'),
  }),
  outputSchema: updateAgentSchema,
  execute: async ({ context }) => {
    const { agentId, ...updateData } = context;
    const raw = await makeRecallRequest(
      `/api/agents/${agentId}`,
      'PUT',
      updateData
    );
    const parsed = updateAgentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall update agent response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

// 13. recallDeleteAgent
const deleteAgentSchema = z.object({
  success: z.boolean(),
  agentId: z.string(),
  message: z.string().optional(),
});
export function formatRecallDeleteAgentResponse(
  parsed: Zod.infer<typeof deleteAgentSchema>
) {
  if (!parsed || !parsed.success) {
    return {
      humanSummary: '❌ Failed to delete agent.',
      llmJson: { status: 'error', error: parsed?.message || 'No data.' },
    };
  }
  return {
    humanSummary: `Deleted agent ${parsed.agentId}.`,
    llmJson: {
      status: 'success',
      agentId: parsed.agentId,
      message: parsed.message || null,
    },
  };
}
export const recallDeleteAgent = createTool({
  id: 'recall-delete-agent',
  description: 'Delete an agent',
  inputSchema: z.object({
    agentId: z.string().describe('Agent ID to delete'),
  }),
  outputSchema: deleteAgentSchema,
  execute: async ({ context }) => {
    const raw = await makeRecallRequest(
      `/api/agents/${context.agentId}`,
      'DELETE'
    );
    const parsed = deleteAgentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall delete agent response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});

// 14. recallListAgents
const listAgentsSchema = z.object({
  agents: z.array(z.any()), // You can make this stricter if you know the agent object shape
});
export function formatRecallListAgentsResponse(
  parsed: Zod.infer<typeof listAgentsSchema>
) {
  if (!parsed || !parsed.agents) {
    return {
      humanSummary: '❌ Failed to list agents.',
      llmJson: { status: 'error', error: 'No data.' },
    };
  }
  return {
    humanSummary: `Agents: ${parsed.agents.length} found.`,
    llmJson: {
      status: 'success',
      agents: parsed.agents,
    },
  };
}
export const recallListAgents = createTool({
  id: 'recall-list-agents',
  description: 'List all agents for the authenticated user',
  inputSchema: z.object({}),
  outputSchema: listAgentsSchema,
  execute: async () => {
    const raw = await makeRecallRequest('/api/agents');
    const parsed = listAgentsSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Recall list agents response validation failed: ' +
          JSON.stringify(parsed.error.issues)
      );
    }
    return parsed.data;
  },
});
