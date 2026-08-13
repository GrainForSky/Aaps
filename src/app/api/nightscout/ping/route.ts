import { NextResponse } from 'next/server';

// Simple health check endpoint - no external dependencies
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      status: 'ok',
      service: 'AndroidAPS Remote Control',
      timestamp: new Date().toISOString(),
    },
  });
}
