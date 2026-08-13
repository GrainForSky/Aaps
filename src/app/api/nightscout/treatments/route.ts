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

// GET: Fetch treatment history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nightscoutUrl = searchParams.get('url');
    const apiSecret = searchParams.get('secret');
    const count = searchParams.get('count') || '20';

    if (!nightscoutUrl || !apiSecret) {
      return NextResponse.json(
        { error: 'Missing Nightscout URL or API Secret' },
        { status: 400 }
      );
    }

    const url = `${nightscoutUrl.replace(/\/$/, '')}/api/v1/treatments?count=${count}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(apiSecret),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch treatments: ${response.status}`, detail: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isNetworkError = message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND');
    return NextResponse.json(
      { error: isNetworkError ? `无法连接到 Nightscout 服务器` : `Failed to fetch treatments: ${message}` },
      { status: isNetworkError ? 502 : 500 }
    );
  }
}

// POST: Create a new treatment (insulin bolus, carbs, or both)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nightscoutUrl, apiSecret, treatment } = body;

    if (!nightscoutUrl || !apiSecret || !treatment) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const url = `${nightscoutUrl.replace(/\/$/, '')}/api/v1/treatments`;
    
    // Build treatment payload for Nightscout
    const treatmentPayload: Record<string, unknown> = {
      created_at: new Date().toISOString(),
      enteredBy: 'AndroidAPS Remote Control',
      eventType: treatment.type || 'Correction Bolus',
    };

    if (treatment.insulin !== undefined && treatment.insulin > 0) {
      treatmentPayload.insulin = treatment.insulin;
      treatmentPayload.eventType = 'Correction Bolus';
    }

    if (treatment.carbs !== undefined && treatment.carbs > 0) {
      treatmentPayload.carbs = treatment.carbs;
      treatmentPayload.eventType = treatment.insulin ? 'Meal Bolus' : 'Carb Correction';
    }

    if (treatment.notes) {
      treatmentPayload.notes = treatment.notes;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(apiSecret),
      body: JSON.stringify(treatmentPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Failed to submit treatment: ${response.status}`, detail: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data, treatment: treatmentPayload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isNetworkError = message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND');
    return NextResponse.json(
      { error: isNetworkError ? `无法连接到 Nightscout 服务器` : `Failed to submit treatment: ${message}` },
      { status: isNetworkError ? 502 : 500 }
    );
  }
}
