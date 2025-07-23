import { NextRequest, NextResponse } from 'next/server';
import { vincentService, TradeRequest } from '../../../../vincent/vincent-integration';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tradeRequest: TradeRequest = body;

    if (!tradeRequest.sessionId || !tradeRequest.tokenAddress || !tradeRequest.investmentAmount) {
      return NextResponse.json(
        { error: 'Session ID, token address, and investment amount are required' },
        { status: 400 }
      );
    }

    if (tradeRequest.investmentAmount <= 0) {
      return NextResponse.json(
        { error: 'Investment amount must be positive' },
        { status: 400 }
      );
    }

    // Execute trade through Vincent
    const result = await vincentService.executeTrade(tradeRequest);

    return NextResponse.json({
      success: true,
      result,
      message: 'Trade executed successfully',
    });

  } catch (error) {
    console.error('Failed to execute trade via Vincent:', error);
    return NextResponse.json(
      { 
        error: 'Failed to execute trade',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
