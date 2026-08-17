import { NextRequest, NextResponse } from 'next/server';
import type { SMSGatewayConfig, SMSSendResult } from '@/lib/types';

/**
 * SMS Gateway API Route
 * Sends SMS commands to AndroidAPS phone via configured SMS gateway.
 * AndroidAPS SMS Communicator receives the SMS and executes the command.
 */

function formatSMSCommand(type: string, params: Record<string, number | string>): string {
  switch (type) {
    case 'bolus':
      return `BOLUS ${params.insulin}`;
    case 'carbs':
      return `CARBS ${params.carbs}`;
    case 'status':
      return 'STATUS';
    case 'suspend':
      return 'SUSPEND';
    case 'resume':
      return 'RESUME';
    case 'target':
      return `TARGET ${params.low} ${params.high} ${params.duration}`;
    default:
      return String(params.text || '');
  }
}

async function sendViaAliyun(config: SMSGatewayConfig, to: string, message: string): Promise<SMSSendResult> {
  // 阿里云短信使用模板发送，这里将 message 作为模板变量传递
  const params = new URLSearchParams({
    Action: 'SendSms',
    PhoneNumbers: to,
    SignName: config.signName || '',
    TemplateCode: config.templateCode || '',
    TemplateParam: JSON.stringify({ content: message }),
    Format: 'JSON',
    Version: '2017-05-25',
    AccessKeyId: config.apiKey,
  });

  try {
    const res = await fetch(`${config.apiUrl}?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (data.Code === 'OK') {
      return { success: true, messageId: data.BizId };
    }
    return { success: false, error: `阿里云短信错误: ${data.Message || data.Code}` };
  } catch (err) {
    return { success: false, error: `阿里云短信发送失败: ${err instanceof Error ? err.message : '未知错误'}` };
  }
}

async function sendViaTwilio(config: SMSGatewayConfig, to: string, message: string): Promise<SMSSendResult> {
  try {
    const body = new URLSearchParams({
      To: to,
      From: config.fromNumber,
      Body: message,
    });

    const res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64'),
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (data.sid) {
      return { success: true, messageId: data.sid };
    }
    return { success: false, error: `Twilio 错误: ${data.message || '未知错误'}` };
  } catch (err) {
    return { success: false, error: `Twilio 发送失败: ${err instanceof Error ? err.message : '未知错误'}` };
  }
}

async function sendViaGeneric(config: SMSGatewayConfig, to: string, message: string): Promise<SMSSendResult> {
  try {
    const res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ to, message, from: config.fromNumber }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (data.success || data.messageId || data.id) {
      return { success: true, messageId: data.messageId || data.id };
    }
    return { success: false, error: `网关错误: ${data.error || data.message || '未知错误'}` };
  } catch (err) {
    return { success: false, error: `网关发送失败: ${err instanceof Error ? err.message : '未知错误'}` };
  }
}

async function sendSMS(config: SMSGatewayConfig, to: string, message: string): Promise<SMSSendResult> {
  switch (config.provider) {
    case 'aliyun':
      return sendViaAliyun(config, to, message);
    case 'tencent':
      // 腾讯云与阿里云类似，使用模板发送
      return sendViaAliyun(config, to, message);
    case 'twilio':
      return sendViaTwilio(config, to, message);
    case 'generic':
    default:
      return sendViaGeneric(config, to, message);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gateway, commandType, params } = body as {
      gateway: SMSGatewayConfig;
      commandType: string;
      params: Record<string, number | string>;
    };

    if (!gateway || !commandType) {
      return NextResponse.json(
        { success: false, error: '缺少 SMS 网关配置或命令类型' },
        { status: 400 }
      );
    }

    if (!gateway.toNumber) {
      return NextResponse.json(
        { success: false, error: '缺少接收方手机号' },
        { status: 400 }
      );
    }

    const smsText = formatSMSCommand(commandType, params);
    console.log(`[SMS] Sending to ${gateway.toNumber}: ${smsText}`);

    const result = await sendSMS(gateway, gateway.toNumber, smsText);

    return NextResponse.json({
      success: result.success,
      data: {
        command: smsText,
        to: gateway.toNumber,
        messageId: result.messageId,
        error: result.error,
      },
      error: result.error,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `SMS 发送异常: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    );
  }
}
