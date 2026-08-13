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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nightscoutUrl, apiSecret } = body;

    if (!nightscoutUrl || !apiSecret) {
      return NextResponse.json(
        { error: 'Missing Nightscout URL or API Secret' },
        { status: 400 }
      );
    }

    const url = `${nightscoutUrl.replace(/\/$/, '')}/api/v1/auth/test`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(apiSecret),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Connection failed: ${response.status}`, detail: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isNetworkError = message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND');
    return NextResponse.json(
      { error: isNetworkError ? `无法连接到 Nightscout 服务器，请检查 URL 是否正确` : `Connection test failed: ${message}` },
      { status: isNetworkError ? 502 : 500 }
    );
  }
}
