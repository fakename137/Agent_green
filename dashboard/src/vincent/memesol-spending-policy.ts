import {
  createVincentToolPolicy,
} from '@lit-protocol/vincent-tool-sdk';
import { z } from 'zod';

// Define spending limit policy schema
const spendingLimitPolicySchema = z.object({
  dailyLimit: z.number().min(0.1).max(100).describe('Daily spending limit in SOL'),
  weeklyLimit: z.number().min(0.5).max(500).describe('Weekly spending limit in SOL'),
  monthlyLimit: z.number().min(1).max(2000).describe('Monthly spending limit in SOL'),
  maxRiskExposure: z.number().min(0.1).max(1).describe('Maximum exposure to high-risk tokens (0.3 = 30%)'),
  maxPositionSize: z.number().min(0.01).max(10).describe('Maximum position size per trade in SOL'),
  minAgentScore: z.number().min(0).max(100).default(30).describe('Minimum agent score required for trades'),
  allowedRiskCategories: z.array(z.enum(['low', 'moderate', 'high'])).default(['low', 'moderate']).describe('Allowed risk categories'),
  emergencyStop: z.boolean().default(false).describe('Emergency stop all trading'),
  whitelist: z.array(z.string()).optional().describe('Whitelisted token addresses'),
  blacklist: z.array(z.string()).optional().describe('Blacklisted token addresses'),
});

// Create a mock Vincent Policy for spending limits
// Note: In production, this would come from @lit-protocol/vincent-policy-spending-limit
const bundledVincentPolicy = {
  packageName: '@your-agent/memesol-spending-limit-policy',
  policyDescription: 'Spending limit policy for memecoin trading with risk controls',
  
  // Policy parameter schema
  policyParamsSchema: z.object({
    tokenAddress: z.string(),
    amount: z.number(),
    riskCategory: z.enum(['low', 'moderate', 'high']).optional(),
    agentScore: z.number().optional(),
  }),
  
  // Policy state schema (tracks current usage)
  policyStateSchema: z.object({
    dailySpent: z.number().default(0),
    weeklySpent: z.number().default(0),
    monthlySpent: z.number().default(0),
    highRiskExposure: z.number().default(0),
    lastResetTime: z.object({
      daily: z.number(),
      weekly: z.number(),
      monthly: z.number(),
    }),
    emergencyStopActive: z.boolean().default(false),
  }),
  
  // Policy evaluation schemas
  policyEvaluateSuccessSchema: z.object({
    allowed: z.boolean(),
    remainingLimits: z.object({
      daily: z.number(),
      weekly: z.number(),
      monthly: z.number(),
    }),
    riskAnalysis: z.object({
      currentRiskExposure: z.number(),
      maxRiskExposure: z.number(),
      riskCategory: z.enum(['low', 'moderate', 'high']),
    }),
  }),
  
  policyEvaluateFailSchema: z.object({
    denied: z.boolean(),
    reason: z.string(),
    currentLimits: z.object({
      dailyUsed: z.number(),
      weeklyUsed: z.number(),
      monthlyUsed: z.number(),
    }),
    violationType: z.enum(['daily_limit', 'weekly_limit', 'monthly_limit', 'risk_limit', 'agent_score', 'blacklist', 'emergency_stop']),
  }),
  
  // Policy commit schemas
  policyCommitSuccessSchema: z.object({
    spentAmount: z.number(),
    remainingLimit: z.number(),
    updatedState: z.object({
      dailySpent: z.number(),
      weeklySpent: z.number(),
      monthlySpent: z.number(),
    }),
  }),
  
  policyCommitFailSchema: z.object({
    error: z.string(),
    reason: z.string(),
  }),
  
  // Policy lifecycle methods
  evaluate: async (policyParams: any, policyState: any, policySettings: any) => {
    const { tokenAddress, amount, riskCategory = 'moderate', agentScore = 50 } = policyParams;
    const now = Date.now();
    
    // Reset counters if needed
    const resetDaily = now - policyState.lastResetTime.daily > 24 * 60 * 60 * 1000;
    const resetWeekly = now - policyState.lastResetTime.weekly > 7 * 24 * 60 * 60 * 1000;
    const resetMonthly = now - policyState.lastResetTime.monthly > 30 * 24 * 60 * 60 * 1000;
    
    if (resetDaily) {
      policyState.dailySpent = 0;
      policyState.lastResetTime.daily = now;
    }
    if (resetWeekly) {
      policyState.weeklySpent = 0;
      policyState.lastResetTime.weekly = now;
    }
    if (resetMonthly) {
      policyState.monthlySpent = 0;
      policyState.lastResetTime.monthly = now;
    }
    
    // Emergency stop check
    if (policySettings.emergencyStop || policyState.emergencyStopActive) {
      return {
        allow: false,
        result: {
          denied: true,
          reason: 'Emergency stop is active',
          violationType: 'emergency_stop',
          currentLimits: {
            dailyUsed: policyState.dailySpent,
            weeklyUsed: policyState.weeklySpent,
            monthlyUsed: policyState.monthlySpent,
          },
        }
      };
    }
    
    // Blacklist check
    if (policySettings.blacklist?.includes(tokenAddress)) {
      return {
        allow: false,
        result: {
          denied: true,
          reason: 'Token is blacklisted',
          violationType: 'blacklist',
          currentLimits: {
            dailyUsed: policyState.dailySpent,
            weeklyUsed: policyState.weeklySpent,
            monthlyUsed: policyState.monthlySpent,
          },
        }
      };
    }
    
    // Agent score check
    if (agentScore < policySettings.minAgentScore) {
      return {
        allow: false,
        result: {
          denied: true,
          reason: `Agent score ${agentScore} below minimum ${policySettings.minAgentScore}`,
          violationType: 'agent_score',
          currentLimits: {
            dailyUsed: policyState.dailySpent,
            weeklyUsed: policyState.weeklySpent,
            monthlyUsed: policyState.monthlySpent,
          },
        }
      };
    }
    
    // Risk category check
    if (!policySettings.allowedRiskCategories.includes(riskCategory)) {
      return {
        allow: false,
        result: {
          denied: true,
          reason: `Risk category '${riskCategory}' not allowed`,
          violationType: 'risk_limit',
          currentLimits: {
            dailyUsed: policyState.dailySpent,
            weeklyUsed: policyState.weeklySpent,
            monthlyUsed: policyState.monthlySpent,
          },
        }
      };
    }
    
    // Position size check
    if (amount > policySettings.maxPositionSize) {
      return {
        allow: false,
        result: {
          denied: true,
          reason: `Position size ${amount} SOL exceeds maximum ${policySettings.maxPositionSize} SOL`,
          violationType: 'daily_limit', // Using daily_limit as generic limit violation
          currentLimits: {
            dailyUsed: policyState.dailySpent,
            weeklyUsed: policyState.weeklySpent,
            monthlyUsed: policyState.monthlySpent,
          },
        }
      };
    }
    
    // Spending limit checks
    if (policyState.dailySpent + amount > policySettings.dailyLimit) {
      return {
        allow: false,
        result: {
          denied: true,
          reason: `Daily limit exceeded: ${policyState.dailySpent + amount} > ${policySettings.dailyLimit}`,
          violationType: 'daily_limit',
          currentLimits: {
            dailyUsed: policyState.dailySpent,
            weeklyUsed: policyState.weeklySpent,
            monthlyUsed: policyState.monthlySpent,
          },
        }
      };
    }
    
    if (policyState.weeklySpent + amount > policySettings.weeklyLimit) {
      return {
        allow: false,
        result: {
          denied: true,
          reason: `Weekly limit exceeded: ${policyState.weeklySpent + amount} > ${policySettings.weeklyLimit}`,
          violationType: 'weekly_limit',
          currentLimits: {
            dailyUsed: policyState.dailySpent,
            weeklyUsed: policyState.weeklySpent,
            monthlyUsed: policyState.monthlySpent,
          },
        }
      };
    }
    
    if (policyState.monthlySpent + amount > policySettings.monthlyLimit) {
      return {
        allow: false,
        result: {
          denied: true,
          reason: `Monthly limit exceeded: ${policyState.monthlySpent + amount} > ${policySettings.monthlyLimit}`,
          violationType: 'monthly_limit',
          currentLimits: {
            dailyUsed: policyState.dailySpent,
            weeklyUsed: policyState.weeklySpent,
            monthlyUsed: policyState.monthlySpent,
          },
        }
      };
    }
    
    // High-risk exposure check
    const riskMultiplier = riskCategory === 'high' ? 1 : riskCategory === 'moderate' ? 0.5 : 0.1;
    const newRiskExposure = policyState.highRiskExposure + (amount * riskMultiplier);
    
    if (newRiskExposure > policySettings.maxRiskExposure * policySettings.monthlyLimit) {
      return {
        allow: false,
        result: {
          denied: true,
          reason: `High-risk exposure limit exceeded`,
          violationType: 'risk_limit',
          currentLimits: {
            dailyUsed: policyState.dailySpent,
            weeklyUsed: policyState.weeklySpent,
            monthlyUsed: policyState.monthlySpent,
          },
        }
      };
    }
    
    // All checks passed
    return {
      allow: true,
      result: {
        allowed: true,
        remainingLimits: {
          daily: policySettings.dailyLimit - policyState.dailySpent,
          weekly: policySettings.weeklyLimit - policyState.weeklySpent,
          monthly: policySettings.monthlyLimit - policyState.monthlySpent,
        },
        riskAnalysis: {
          currentRiskExposure: policyState.highRiskExposure,
          maxRiskExposure: policySettings.maxRiskExposure * policySettings.monthlyLimit,
          riskCategory,
        },
      }
    };
  },
  
  commit: async (policyParams: any, policyState: any, policySettings: any) => {
    const { amount, riskCategory = 'moderate' } = policyParams;
    
    try {
      // Update spending counters
      policyState.dailySpent += amount;
      policyState.weeklySpent += amount;
      policyState.monthlySpent += amount;
      
      // Update risk exposure
      const riskMultiplier = riskCategory === 'high' ? 1 : riskCategory === 'moderate' ? 0.5 : 0.1;
      policyState.highRiskExposure += amount * riskMultiplier;
      
      return {
        allow: true,
        result: {
          spentAmount: amount,
          remainingLimit: policySettings.dailyLimit - policyState.dailySpent,
          updatedState: {
            dailySpent: policyState.dailySpent,
            weeklySpent: policyState.weeklySpent,
            monthlySpent: policyState.monthlySpent,
          },
        }
      };
    } catch (error) {
      return {
        allow: false,
        result: {
          error: 'Failed to commit spending limit',
          reason: error instanceof Error ? error.message : 'Unknown error',
        }
      };
    }
  },
};

// Tool parameter schema for memecoin trading
const toolParamsSchema = z.object({
  tokenAddress: z.string(),
  investmentAmount: z.number(),
  riskCategory: z.enum(['low', 'moderate', 'high']),
  agentScore: z.number(),
});

// Create the policy mapping
export const MemesolSpendingLimitPolicy = createVincentToolPolicy({
  toolParamsSchema,
  bundledVincentPolicy,
  toolParameterMappings: {
    tokenAddress: 'tokenAddress',
    investmentAmount: 'amount',
    riskCategory: 'riskCategory',
    agentScore: 'agentScore',
  },
});

// Export policy settings interface for the dashboard
export interface MemesolSpendingLimitSettings {
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  maxRiskExposure: number;
  maxPositionSize: number;
  minAgentScore: number;
  allowedRiskCategories: ('low' | 'moderate' | 'high')[];
  emergencyStop: boolean;
  whitelist?: string[];
  blacklist?: string[];
}

export { spendingLimitPolicySchema };
