import { NextRequest, NextResponse } from 'next/server';
import { registerDevice, checkRateLimit } from '@/lib/store';
import { RATE_LIMITS, PHONE_REGEX, DEVICE_ID_REGEX } from '@/lib/types';
import type { DeviceRegisterRequest, DeviceRegisterResponse } from '@/lib/types';

/**
 * POST /api/device/register
 * 设备注册（AndroidAPS 启动时调用）
 * 返回 deviceToken 用于后续认证
 */
export async function POST(request: NextRequest) {
  try {
    const body: DeviceRegisterRequest = await request.json();
    const { phone, deviceId, appVersion } = body;

    // Input validation
    if (!phone || !deviceId || !appVersion) {
      return NextResponse.json(
        { success: false, message: '缺少 phone、deviceId 或 appVersion 参数' },
        { status: 400 },
      );
    }

    if (!PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        { success: false, message: '无效的手机号格式' },
        { status: 400 },
      );
    }

    if (!DEVICE_ID_REGEX.test(deviceId)) {
      return NextResponse.json(
        { success: false, message: '无效的设备 ID 格式' },
        { status: 400 },
      );
    }

    // Rate limiting
    const rateLimit = checkRateLimit(`register:${phone}`, RATE_LIMITS.DEVICE_REGISTER);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, message: '请求过于频繁，请稍后再试' },
        { status: 429 },
      );
    }

    const device = registerDevice(phone, deviceId, appVersion);

    const response: DeviceRegisterResponse = {
      success: true,
      message: `设备 ${deviceId} 注册成功`,
      deviceToken: device.deviceToken,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Device Register] Error:', error);
    return NextResponse.json(
      { success: false, message: '设备注册失败' },
      { status: 500 },
    );
  }
}
