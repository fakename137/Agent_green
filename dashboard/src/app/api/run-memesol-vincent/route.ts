import { NextRequest, NextResponse } from 'next/server';
import { executeAgentTradeViaVincent } from '../../../vincent/vincent-integration';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, autoInvest = false } = body;

    // Run the memesol workflow to get token analysis
    console.log('[MemeSol-Vincent] Starting workflow analysis...');
    
    const workflowResponse = await fetch('http://localhost:4111/run-memesol', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!workflowResponse.ok) {
      throw new Error(`Workflow failed: ${workflowResponse.statusText}`);
    }

    const workflowData = await workflowResponse.json();
    
    if (!workflowData.tokens || workflowData.tokens.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No viable tokens found in this analysis cycle',
        tokens: [],
        trades: [],
      });
    }

    const analysisResults = {
      tokens: workflowData.tokens,
      summary: workflowData.summary,
      analysisTime: new Date().toISOString(),
    };

    // If Vincent session is provided and auto-invest is enabled, execute trades
    const tradeResults = [];
    
    if (sessionId && autoInvest) {
      console.log(`[MemeSol-Vincent] Auto-investing via Vincent session: ${sessionId}`);
      
      // Filter tokens that passed the analysis
      const viableTokens = workflowData.tokens.filter((token: any) => 
        token.score >= 30 && 
        !token.errors?.length &&
        token.data?.rug?.rugCheck?.checklist?.verdict === 'SAFE'
      );

      console.log(`[MemeSol-Vincent] Found ${viableTokens.length} viable tokens for trading`);

      // Execute trades for viable tokens (limit to top 3)
      const topTokens = viableTokens
        .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
        .slice(0, 3);

      for (const token of topTokens) {
        try {
          // Determine investment amount based on risk and score
          let investmentAmount = 0.5; // Base amount in SOL
          
          if (token.score >= 70) {
            investmentAmount = 1.0; // Higher confidence = larger position
          } else if (token.score >= 50) {
            investmentAmount = 0.75;
          } else {
            investmentAmount = 0.25; // Lower confidence = smaller position
          }

          console.log(`[MemeSol-Vincent] Executing trade for ${token.address} with ${investmentAmount} SOL`);

          const tradeResult = await executeAgentTradeViaVincent(
            sessionId,
            {
              address: token.address,
              score: token.score || 0,
              category: token.category || 'moderate',
              socialSentiment: extractSocialSentiment(token.data),
            },
            investmentAmount
          );

          tradeResults.push({
            tokenAddress: token.address,
            success: true,
            result: tradeResult,
            investmentAmount,
            agentScore: token.score,
          });

          console.log(`[MemeSol-Vincent] Trade successful for ${token.address}`);

        } catch (error) {
          console.error(`[MemeSol-Vincent] Trade failed for ${token.address}:`, error);
          
          tradeResults.push({
            tokenAddress: token.address,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            investmentAmount: 0,
            agentScore: token.score,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      analysis: analysisResults,
      trades: tradeResults,
      message: `Analysis completed. Found ${workflowData.tokens.length} tokens${sessionId ? `, executed ${tradeResults.filter(t => t.success).length} trades` : ''}`,
    });

  } catch (error) {
    console.error('[MemeSol-Vincent] Workflow execution failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to run memesol workflow with Vincent integration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper function to extract social sentiment from token data
function extractSocialSentiment(tokenData: any): number {
  try {
    let totalSentiment = 0;
    let count = 0;

    // Extract sentiment from various social sources
    if (tokenData?.telegram?.success && typeof tokenData.telegram.data?.messages?.sentimentScore === 'number') {
      totalSentiment += tokenData.telegram.data.messages.sentimentScore;
      count++;
    }

    if (tokenData?.discord?.success && typeof tokenData.discord.data?.activity?.sentimentScore === 'number') {
      totalSentiment += tokenData.discord.data.activity.sentimentScore;
      count++;
    }

    if (tokenData?.influencerMentions?.success && typeof tokenData.influencerMentions.data?.aggregate_sentiment === 'number') {
      totalSentiment += tokenData.influencerMentions.data.aggregate_sentiment;
      count++;
    }

    if (tokenData?.reddit?.success && typeof tokenData.reddit.data?.sentiment === 'number') {
      totalSentiment += tokenData.reddit.data.sentiment;
      count++;
    }

    // Return average sentiment or neutral if no data
    return count > 0 ? totalSentiment / count : 0;
  } catch (error) {
    console.warn('Failed to extract social sentiment:', error);
    return 0; // Neutral sentiment as fallback
  }
}
