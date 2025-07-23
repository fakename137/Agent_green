import { NextRequest, NextResponse } from 'next/server';
import { vincentService } from '../../../../vincent/vincent-integration';

export async function GET() {
  try {
    const sessions = vincentService.getAllSessions();
    
    // Get metrics for each session
    const sessionsWithMetrics = await Promise.all(
      sessions.map(async (session) => {
        try {
          const metrics = await vincentService.getSessionMetrics(session.sessionId);
          return {
            ...session,
            metrics,
          };
        } catch (error) {
          console.warn(`Failed to get metrics for session ${session.sessionId}:`, error);
          return {
            ...session,
            metrics: null,
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      sessions: sessionsWithMetrics,
    });

  } catch (error) {
    console.error('Failed to fetch Vincent sessions:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch sessions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
