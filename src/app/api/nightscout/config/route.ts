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

    // Try multiple endpoints for compatibility with different Nightscout versions
    const baseUrl = nightscoutUrl.replace(/\/$/, '');
    const endpoints = [
      '/api/v1/status.json',
      '/api/v1/entries.json?count=1',
      '/api/v1/auth/test',
    ];

    let lastError = '';
    let connected = false;
    let responseData = null;

    for (const endpoint of endpoints) {
      try {
        const url = `${baseUrl}${endpoint}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: getHeaders(apiSecret),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          try {
            responseData = await response.json();
          } catch {
            responseData = { status: 'ok' };
          }
          connected = true;
          break;
        } else {
          lastError = `Endpoint ${endpoint} returned ${response.status}`;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Unknown error';
        // If it's a network error, no point trying other endpoints
        if (lastError.includes('fetch failed') || lastError.includes('ECONNREFUSED') || lastError.includes('ENOTFOUND')) {
          break;
        }
      }
    }

    if (!connected) {
      const isNetworkError = lastError.includes('fetch failed') || lastError.includes('ECONNREFUSED') || lastError.includes('ENOTFOUND');
      return NextResponse.json(
        { error: isNetworkError ? `无法连接到 Nightscout 服务器，请检查 URL 是否正确` : `连接失败: ${lastError}` },
        { status: isNetworkError ? 502 : 400 }
      );
    }

    return NextResponse.json({ success: true, data: responseData });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isNetworkError = message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND');
    return NextResponse.json(
      { error: isNetworkError ? `无法连接到 Nightscout 服务器，请检查 URL 是否正确` : `Connection test failed: ${message}` },
      { status: isNetworkError ? 502 : 500 }
    );
  }
}
