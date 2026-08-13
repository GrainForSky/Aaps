import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function hashApiSecret(secret: string): string {
  return crypto.createHash('sha1').update(secret).digest('hex');
}

function getHeaders(apiSecret: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'api-secret': hashApiSecret(apiSecret),
  };
}

// GET: Fetch device status (pump status, loop status, etc.)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nightscoutUrl = searchParams.get('url');
    const apiSecret = searchParams.get('secret');
    const count = searchParams.get('count') || '1';

    if (!nightscoutUrl || !apiSecret) {
      return NextResponse.json(
        { error: 'Missing Nightscout URL or API Secret' },
        { status: 400 }
      );
    }

    const url = `${nightscoutUrl.replace(/\/$/, '')}/api/v1/devicestatus?count=${count}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(apiSecret),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch device status: ${response.status}`, detail: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isNetworkError = message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND');
    return NextResponse.json(
      { error: isNetworkError ? `无法连接到 Nightscout 服务器` : `Failed to fetch device status: ${message}` },
      { status: isNetworkError ? 502 : 500 }
    );
  }
}
