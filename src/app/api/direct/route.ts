import { NextRequest, NextResponse } from 'next/server';

/**
 * Direct API proxy route
 * Proxies requests to the Android device's HTTP server
 * 
 * Supported endpoints on the Android device:
 * - POST /bolus     - { insulin: number } - Deliver insulin bolus
 * - POST /carbs     - { carbs: number }   - Record carbs
 * - POST /treatment - { insulin?: number, carbs?: number, notes?: string }
 * - GET  /status    - Get pump/device status
 * - GET  /cgm       - Get recent CGM readings
 * - GET  /treatments?count=20 - Get treatment history
 * - GET  /ping      - Health check
 */

function getHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// POST: Send commands to the Android device
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceUrl, token, action, payload } = body;

    if (!deviceUrl || !action) {
      return NextResponse.json(
        { error: '缺少设备地址或操作参数' },
        { status: 400 }
      );
    }

    const baseUrl = deviceUrl.replace(/\/$/, '');
    let endpoint = '';
    let method = 'POST';
    let requestBody: Record<string, unknown> | undefined;

    switch (action) {
      case 'bolus':
        endpoint = '/bolus';
        requestBody = { insulin: payload?.insulin };
        break;
      case 'carbs':
        endpoint = '/carbs';
        requestBody = { carbs: payload?.carbs };
        break;
      case 'treatment':
        endpoint = '/treatment';
        requestBody = {
          insulin: payload?.insulin,
          carbs: payload?.carbs,
          notes: payload?.notes,
        };
        break;
      case 'ping':
        endpoint = '/ping';
        method = 'GET';
        break;
      default:
        return NextResponse.json(
          { error: `不支持的操作: ${action}` },
          { status: 400 }
        );
    }

    const url = `${baseUrl}${endpoint}`;
    const fetchOptions: RequestInit = {
      method,
      headers: getHeaders(token),
      signal: AbortSignal.timeout(15000),
    };

    if (method === 'POST' && requestBody) {
      fetchOptions.body = JSON.stringify(requestBody);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return NextResponse.json(
        { error: `设备返回错误: ${response.status}`, detail: errorText },
        { status: response.status }
      );
    }

    const data = await response.json().catch(() => ({ success: true }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isNetworkError =
      message.includes('fetch failed') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND') ||
      message.includes('aborted');

    return NextResponse.json(
      {
        error: isNetworkError
          ? '无法连接到设备，请检查设备地址和网络连接'
          : `请求失败: ${message}`,
      },
      { status: isNetworkError ? 502 : 500 }
    );
  }
}

// GET: Fetch data from the Android device
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceUrl = searchParams.get('url');
    const token = searchParams.get('token');
    const action = searchParams.get('action');
    const count = searchParams.get('count') || '20';

    if (!deviceUrl || !action) {
      return NextResponse.json(
        { error: '缺少设备地址或操作参数' },
        { status: 400 }
      );
    }

    const baseUrl = deviceUrl.replace(/\/$/, '');
    let endpoint = '';

    switch (action) {
      case 'status':
        endpoint = '/status';
        break;
      case 'cgm':
        endpoint = `/cgm?count=${count}`;
        break;
      case 'treatments':
        endpoint = `/treatments?count=${count}`;
        break;
      case 'ping':
        endpoint = '/ping';
        break;
      default:
        return NextResponse.json(
          { error: `不支持的操作: ${action}` },
          { status: 400 }
        );
    }

    const url = `${baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(token || undefined),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return NextResponse.json(
        { error: `设备返回错误: ${response.status}`, detail: errorText },
        { status: response.status }
      );
    }

    const data = await response.json().catch(() => ({}));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isNetworkError =
      message.includes('fetch failed') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND') ||
      message.includes('aborted');

    return NextResponse.json(
      {
        error: isNetworkError
          ? '无法连接到设备，请检查设备地址和网络连接'
          : `请求失败: ${message}`,
      },
      { status: isNetworkError ? 502 : 500 }
    );
  }
}
