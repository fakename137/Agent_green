import { memesolTradingTool } from './memesol-trading-tool';
import { MemesolSpendingLimitSettings } from './memesol-spending-policy';

export interface VincentSession {
  sessionId: string;
  pkpAddress: string;
  toolSettings: MemesolSpendingLimitSettings;
  status: 'active' | 'paused' | 'stopped';
  createdAt: string;
  lastActivity?: string;
}

export interface TradeRequest {
  sessionId: string;
  tokenAddress: string;
  investmentAmount: number;
  maxSlippage: number;
  stopLoss?: number;
  takeProfit?: number;
  timeLimit?: number;
}

export class VincentIntegrationService {
  private sessions: Map<string, VincentSession> = new Map();
  private baseUrl: string;

  constructor(baseUrl: string = 'https://api.heyvincent.ai') {
    this.baseUrl = baseUrl;
  }

  /**
   * Create a new Vincent investment session with custom policies
   */
  async createInvestmentSession(
    walletAddress: string,
    settings: MemesolSpendingLimitSettings
  ): Promise<VincentSession> {
    try {
      // In production, this would call Vincent's API to create a PKP and deploy policies
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const session: VincentSession = {
        sessionId,
        pkpAddress: `0x${Math.random().toString(16).substr(2, 40)}`, // Mock PKP address
        toolSettings: settings,
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      this.sessions.set(sessionId, session);
      
      console.log('[Vincent] Created investment session:', session);
      
      // Deploy the memesol trading tool with policies to Vincent
      await this.deployTradingTool(sessionId, settings);
      
      return session;
    } catch (error) {
      console.error('[Vincent] Failed to create investment session:', error);
      throw new Error(`Failed to create investment session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deploy the memecoin trading tool to Vincent with specified policies
   */
  private async deployTradingTool(sessionId: string, settings: MemesolSpendingLimitSettings) {
    try {
      // In production, this would:
      // 1. Package the memesolTradingTool for Vincent
      // 2. Deploy it to IPFS
      // 3. Register it with the PKP
      // 4. Configure the spending limit policies
      
      console.log('[Vincent] Deploying trading tool for session:', sessionId);
      console.log('[Vincent] Tool settings:', settings);
      
      // Mock deployment process
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('[Vincent] Trading tool deployed successfully');
    } catch (error) {
      console.error('[Vincent] Failed to deploy trading tool:', error);
      throw error;
    }
  }

  /**
   * Execute a trade through Vincent using the deployed tool
   */
  async executeTrade(request: TradeRequest): Promise<any> {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      throw new Error('Investment session not found');
    }

    if (session.status !== 'active') {
      throw new Error(`Cannot trade: session status is ${session.status}`);
    }

    try {
      console.log('[Vincent] Executing trade request:', request);
      
      // In production, this would call Vincent's execution API
      const tradeParams = {
        tokenAddress: request.tokenAddress,
        investmentAmount: request.investmentAmount,
        maxSlippage: request.maxSlippage,
        stopLoss: request.stopLoss,
        takeProfit: request.takeProfit,
        timeLimit: request.timeLimit || 14400,
        riskCategory: 'moderate' as const, // This would come from your agent's analysis
        agentScore: 65, // This would come from your agent's scoring
        socialSentiment: 0.3, // This would come from your social analysis
      };

      // Mock execution - in production this would be a real Vincent tool execution
      const mockResult = {
        success: true,
        transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
        tokensReceived: Math.floor(Math.random() * 1000000),
        entryPrice: 0.001 + Math.random() * 0.009,
        estimatedGas: 0.005,
        message: 'Trade executed successfully via Vincent',
      };

      // Update session activity
      session.lastActivity = new Date().toISOString();
      this.sessions.set(request.sessionId, session);

      return mockResult;
    } catch (error) {
      console.error('[Vincent] Trade execution failed:', error);
      throw new Error(`Trade execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update policy settings for an active session
   */
  async updatePolicySettings(
    sessionId: string,
    newSettings: Partial<MemesolSpendingLimitSettings>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Investment session not found');
    }

    try {
      console.log('[Vincent] Updating policy settings for session:', sessionId);
      
      // Merge new settings with existing ones
      session.toolSettings = { ...session.toolSettings, ...newSettings };
      session.lastActivity = new Date().toISOString();
      
      this.sessions.set(sessionId, session);
      
      // In production, this would update the policies deployed to Vincent
      console.log('[Vincent] Policy settings updated:', session.toolSettings);
    } catch (error) {
      console.error('[Vincent] Failed to update policy settings:', error);
      throw error;
    }
  }

  /**
   * Pause/resume a trading session
   */
  async toggleSessionStatus(sessionId: string): Promise<VincentSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Investment session not found');
    }

    try {
      session.status = session.status === 'active' ? 'paused' : 'active';
      session.lastActivity = new Date().toISOString();
      
      this.sessions.set(sessionId, session);
      
      console.log(`[Vincent] Session ${sessionId} status changed to: ${session.status}`);
      
      return session;
    } catch (error) {
      console.error('[Vincent] Failed to toggle session status:', error);
      throw error;
    }
  }

  /**
   * Emergency stop all trading for a session
   */
  async emergencyStop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Investment session not found');
    }

    try {
      console.log('[Vincent] Emergency stop activated for session:', sessionId);
      
      session.toolSettings.emergencyStop = true;
      session.status = 'stopped';
      session.lastActivity = new Date().toISOString();
      
      this.sessions.set(sessionId, session);
      
      // In production, this would immediately halt all trading activities
      console.log('[Vincent] Emergency stop completed');
    } catch (error) {
      console.error('[Vincent] Emergency stop failed:', error);
      throw error;
    }
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): VincentSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for monitoring
   */
  getAllSessions(): VincentSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session performance metrics
   */
  async getSessionMetrics(sessionId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Investment session not found');
    }

    // In production, this would fetch real metrics from Vincent/blockchain
    return {
      sessionId,
      totalTrades: Math.floor(Math.random() * 20) + 5,
      successfulTrades: Math.floor(Math.random() * 15) + 3,
      totalInvested: Math.random() * 50 + 10,
      currentValue: Math.random() * 60 + 8,
      unrealizedPnL: (Math.random() - 0.4) * 20,
      spendingLimitUsage: {
        daily: Math.random() * session.toolSettings.dailyLimit,
        weekly: Math.random() * session.toolSettings.weeklyLimit,
        monthly: Math.random() * session.toolSettings.monthlyLimit,
      },
      lastTradeTime: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  /**
   * Clean up expired or stopped sessions
   */
  async cleanupSessions(): Promise<void> {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    for (const [sessionId, session] of this.sessions.entries()) {
      const sessionAge = now - new Date(session.createdAt).getTime();
      
      if (sessionAge > maxAge && session.status === 'stopped') {
        console.log(`[Vincent] Cleaning up expired session: ${sessionId}`);
        this.sessions.delete(sessionId);
      }
    }
  }
}

// Global instance for the application
export const vincentService = new VincentIntegrationService();

// Helper function to integrate with your existing memesol workflow
export async function executeAgentTradeViaVincent(
  sessionId: string,
  tokenData: {
    address: string;
    score: number;
    category: string;
    socialSentiment: number;
  },
  investmentAmount: number
): Promise<any> {
  const session = vincentService.getSession(sessionId);
  if (!session) {
    throw new Error('Investment session not found');
  }

  // Determine risk category based on agent analysis
  let riskCategory: 'low' | 'moderate' | 'high' = 'moderate';
  if (tokenData.score >= 70) riskCategory = 'low';
  else if (tokenData.score <= 40) riskCategory = 'high';

  // Check if risk category is allowed
  if (!session.toolSettings.allowedRiskCategories.includes(riskCategory)) {
    throw new Error(`Risk category '${riskCategory}' not allowed for this session`);
  }

  // Check position size limits
  if (investmentAmount > session.toolSettings.maxPositionSize) {
    throw new Error(`Investment amount exceeds maximum position size of ${session.toolSettings.maxPositionSize} SOL`);
  }

  // Check agent score requirements
  if (tokenData.score < session.toolSettings.minAgentScore) {
    throw new Error(`Token score ${tokenData.score} below minimum required score of ${session.toolSettings.minAgentScore}`);
  }

  // Execute the trade
  return await vincentService.executeTrade({
    sessionId,
    tokenAddress: tokenData.address,
    investmentAmount,
    maxSlippage: 0.05, // 5% default slippage
    stopLoss: riskCategory === 'high' ? 0.15 : riskCategory === 'moderate' ? 0.20 : 0.25,
    takeProfit: riskCategory === 'high' ? 1.5 : riskCategory === 'moderate' ? 2.0 : 3.0,
    timeLimit: 14400, // 4 hours
  });
}
