import { NextRequest, NextResponse } from 'next/server';
import { runMemesolWorkflowCached } from '@/backend/memesol-tool';

function isErrorWithMessage(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}

export async function GET(req: NextRequest) {
  try {
    // Legacy: could call multiStageTokenFilter if needed
    return NextResponse.json(
      { message: 'Use POST to run Memesol workflow.' },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST',
        },
      }
    );
  } catch (err: unknown) {
    let message = 'Internal Server Error';
    if (isErrorWithMessage(err)) {
      message = err.message;
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const result = await runMemesolWorkflowCached();
    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
      },
    });
  } catch (err: unknown) {
    let message = 'Internal Server Error';
    if (isErrorWithMessage(err)) {
      message = err.message;
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
