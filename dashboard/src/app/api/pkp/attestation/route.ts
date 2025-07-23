import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      authMethod, 
      pkpPublicKey, 
      ethAddress,
      spendingLimits 
    } = body;

    if (!authMethod || !pkpPublicKey || !ethAddress) {
      return NextResponse.json(
        { error: 'Missing required PKP attestation data' },
        { status: 400 }
      );
    }

    // Store PKP attestation data
    // In production, this would be stored in a secure database
    const attestationRecord = {
      id: `attestation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      pkpPublicKey,
      ethAddress,
      authMethod: {
        authMethodType: authMethod.authMethodType,
        // Don't store sensitive auth data
        verified: true,
      },
      spendingLimits,
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    console.log('[PKP API] Attestation recorded:', attestationRecord.id);

    return NextResponse.json({
      success: true,
      attestationId: attestationRecord.id,
      message: 'PKP attestation recorded successfully',
    });

  } catch (error) {
    console.error('PKP attestation failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to record PKP attestation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const ethAddress = url.searchParams.get('ethAddress');

    if (!ethAddress) {
      return NextResponse.json(
        { error: 'ETH address is required' },
        { status: 400 }
      );
    }

    // Retrieve PKP attestation data
    // In production, this would query a secure database
    const mockAttestation = {
      id: 'attestation_example',
      pkpPublicKey: '0x04...',
      ethAddress,
      authMethod: {
        authMethodType: 1, // Google JWT
        verified: true,
      },
      spendingLimits: {
        dailyLimit: 1.0,
        weeklyLimit: 5.0,
        monthlyLimit: 20.0,
        maxRiskExposure: 0.3,
        maxPositionSize: 0.5,
        minAgentScore: 40,
        allowedRiskCategories: ['low', 'moderate'],
        emergencyStop: false,
      },
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    return NextResponse.json({
      success: true,
      attestation: mockAttestation,
    });

  } catch (error) {
    console.error('Failed to retrieve PKP attestation:', error);
    return NextResponse.json(
      { 
        error: 'Failed to retrieve PKP attestation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
