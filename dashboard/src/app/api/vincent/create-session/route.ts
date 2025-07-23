import { NextRequest, NextResponse } from 'next/server';
import { vincentService } from '../../../../vincent/vincent-integration';
import { MemesolSpendingLimitSettings } from '../../../../vincent/memesol-spending-policy';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, settings }: { 
      walletAddress: string; 
      settings: MemesolSpendingLimitSettings 
    } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    // Validate settings
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Valid settings are required' },
        { status: 400 }
      );
    }

    // Create Vincent investment session
    const session = await vincentService.createInvestmentSession(
      walletAddress,
      settings
    );

    return NextResponse.json({
      success: true,
      session,
      message: 'Investment session created successfully',
    });

  } catch (error) {
    console.error('Failed to create Vincent session:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create investment session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
