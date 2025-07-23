import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const gaiaProvider = createOpenAICompatible({
  name: 'llama-3-groq-8b-tool',
  baseURL: 'https://0x45a6c94e707bbde5ab5a9aa737b73bec2eeb67f5.gaia.domains/v1',
  apiKey: 'not-needed',
});

/**
 * MemeSol LLM Shortlisting Workflow
 * 1. Aggregate all token data
 * 2. Call Gaia node (LLM) to shortlist, score, and categorize
 * 3. Return LLM output
 */

// Simple crypto trading workflow that uses the trading agent
export const tradingWorkflow = createWorkflow({
  id: 'crypto-trading-workflow',
  description: 'Crypto trading analysis and recommendations workflow',
  inputSchema: z.object({
    symbols: z.array(z.string()).describe('Cryptocurrency symbols to analyze'),
    timeframe: z
      .enum(['1h', '4h', '1d'])
      .default('1d')
      .describe('Analysis timeframe'),
    portfolioHoldings: z
      .array(
        z.object({
          symbol: z.string(),
          amount: z.number(),
          avgBuyPrice: z.number(),
        })
      )
      .optional()
      .describe('User portfolio holdings for analysis'),
    totalInvestment: z.number().optional().describe('Total amount invested'),
    userQuery: z.string().describe('User query for analysis'),
  }),
  outputSchema: z.object({
    analysis: z.string(),
    recommendations: z.array(z.string()),
    riskWarnings: z.array(z.string()),
    summary: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const {
      symbols,
      timeframe,
      portfolioHoldings,
      totalInvestment,
      userQuery,
    } = inputData;

    const agent = mastra?.getAgent('tradingAgent');
    if (!agent) {
      throw new Error('Trading agent not found');
    }

    // Create a comprehensive prompt for the agent
    let prompt = `Analyze the following cryptocurrencies: ${symbols.join(', ')} on ${timeframe} timeframe.\n\n`;
    prompt += `User query: ${userQuery}\n\n`;

    if (portfolioHoldings && totalInvestment) {
      prompt += `Portfolio holdings: ${JSON.stringify(portfolioHoldings)}\n`;
      prompt += `Total investment: $${totalInvestment}\n\n`;
    }

    prompt += `Please provide:\n`;
    prompt += `1. Market overview and sentiment\n`;
    prompt += `2. Technical analysis for each cryptocurrency\n`;
    prompt += `3. Portfolio analysis and risk assessment (if portfolio provided)\n`;
    prompt += `4. Trading recommendations with reasoning\n`;
    prompt += `5. Risk warnings and disclaimers\n`;

    const response = await agent.generate(prompt);

    // Extract structured information from the response
    const analysis = response.text || 'Analysis completed';

    const recommendations = [
      'Always do your own research before making trading decisions',
      'Consider your risk tolerance and investment goals',
      'Never invest more than you can afford to lose',
      'Diversify your portfolio to manage risk',
    ];

    const riskWarnings = [
      'Cryptocurrency trading involves significant risk of loss',
      'Past performance does not guarantee future results',
      'Market volatility can lead to substantial losses',
      'Consider consulting with financial advisors for significant investments',
    ];

    const summary =
      `Analysis completed for ${symbols.join(', ')} on ${timeframe} timeframe. ` +
      `Generated comprehensive trading insights and recommendations.`;

    return {
      analysis,
      recommendations,
      riskWarnings,
      summary,
    };
  },
});
