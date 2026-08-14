import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * SMS Gateway API Route
 * Sends commands via SMS gateway to AndroidAPS phone
 * AndroidAPS SMS Communicator will receive and execute the commands
 */

interface SMSConfig {
  provider: 'generic' | 'twilio' | 'aliyun' | 'tencent';
  apiUrl: string;
  apiKey: string;
  apiSecret?: string;
  fromNumber?: string;
  toNumber: string;
  signName?: string;
  templateCode?: string;
}

function formatSMSCommand(type: string, value?: number): string {
  switch (type) {
    case 'bolus':
      return `BOLUS ${value}`;
    case 'carbs':
      return `CARBS ${value}`;
    case 'treatment':
      return `BOLUS ${value}`;
    case 'status':
      return 'STATUS';
    case 'bg':
      return `BG ${value}`;
    case 'suspend':
      return 'SUSPEND';
    case 'resume':
      return 'RESUME';
    case 'loop':
      return 'LOOP';
    default:
      return type.toUpperCase();
  }
}

async function sendViaTwilio(
  config: SMSConfig,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const credentials = Buffer.from(
      `${config.apiKey}:${config.apiSecret}`
    ).toString('base64');

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.apiKey}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: config.fromNumber || '',
          To: config.toNumber,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Twilio API error: ${error}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function sendViaAliyun(
  config: SMSConfig,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const params: Record<string, string> = {
      AccessKeyId: config.apiKey,
      Action: 'SendSms',
      Format: 'JSON',
      PhoneNumbers: config.toNumber,
      RegionId: 'cn-hangzhou',
      SignName: config.signName || '',
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: crypto.randomUUID(),
      SignatureVersion: '1.0',
      TemplateCode: config.templateCode || '',
      TemplateParam: JSON.stringify({ content: message }),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      Version: '2017-05-25',
    };

    const sortedParams = Object.keys(params)
      .sort()
      .map(
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
      )
      .join('&');

    const stringToSign = `POST&${encodeURIComponent('/')}&${encodeURIComponent(sortedParams)}`;
    const signature = crypto
      .createHmac('sha1', `${config.apiSecret}&`)
      .update(stringToSign)
      .digest('base64');

    params.Signature = signature;

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: config.apiUrl,
        params,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Aliyun SMS API error: ${error}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function sendViaTencent(
  config: SMSConfig,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      PhoneNumber: config.toNumber,
      SmsSdkAppId: config.apiKey,
      SignName: config.signName || '',
      TemplateId: config.templateCode || '',
      TemplateParamSet: [message],
    });

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiSecret}`,
        'X-TC-Timestamp': timestamp.toString(),
      },
      body: payload,
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Tencent SMS API error: ${error}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function sendViaGeneric(
  config: SMSConfig,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        to: config.toNumber,
        from: config.fromNumber,
        message: message,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `SMS API error: ${error}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function sendSMS(
  config: SMSConfig,
  message: string
): Promise<{ success: boolean; error?: string }> {
  switch (config.provider) {
    case 'twilio':
      return sendViaTwilio(config, message);
    case 'aliyun':
      return sendViaAliyun(config, message);
    case 'tencent':
      return sendViaTencent(config, message);
    case 'generic':
    default:
      return sendViaGeneric(config, message);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gateway, action, value } = body as {
      gateway: SMSConfig;
      action: string;
      value?: number;
    };

    if (!gateway) {
      return NextResponse.json(
        { error: '缺少 SMS 网关配置' },
        { status: 400 }
      );
    }

    if (!action) {
      return NextResponse.json(
        { error: '缺少操作类型' },
        { status: 400 }
      );
    }

    if (!gateway.toNumber) {
      return NextResponse.json(
        { error: '缺少目标手机号' },
        { status: 400 }
      );
    }

    const smsMessage = formatSMSCommand(action, value);
    const result = await sendSMS(gateway, smsMessage);

    if (!result.success) {
      return NextResponse.json(
        { error: `短信发送失败: ${result.error}`, detail: result.error },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        message: '命令已通过短信发送',
        smsCommand: smsMessage,
        sentTo: gateway.toNumber,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `发送失败: ${errorMessage}` },
      { status: 500 }
    );
  }
}
