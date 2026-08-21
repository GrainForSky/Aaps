import { NextRequest, NextResponse } from 'next/server';
import { updateHeartbeat, validateDeviceToken, checkRateLimit } from '@/lib/store';
import { RATE_LIMITS } from '@/lib/types';
import type { DeviceHeartbeatRequest } from '@/lib/types';

/**
 * POST /api/device/heartbeat
 * 设备心跳（每 30 秒调用一次）
 * 需要 deviceToken 认证
 */
export async function POST(request: NextRequest) {
  try {
    const body: DeviceHeartbeatRequest = await request.json();
    const { phone, deviceId, deviceToken } = body;

    if (!phone || !deviceId || !deviceToken) {
      return NextResponse.json(
        { success: false, message: '缺少 phone、deviceId 或 deviceToken 参数' },
        { status: 400 },
      );
    }

    // Validate device token
    const device = validateDeviceToken(deviceToken);
    if (!device) {
      return NextResponse.json(
        { success: false, message: '设备认证失败，请重新注册' },
        { status: 401 },
      );
    }

    // Verify phone and deviceId match the token
    if (device.phone !== phone || device.deviceId !== deviceId) {
      return NextResponse.json(
        { success: false, message: '设备信息不匹配' },
        { status: 403 },
      );
    }

    // Rate limiting
    const rateLimit = checkRateLimit(`heartbeat:${phone}`, RATE_LIMITS.DEVICE_HEARTBEAT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, message: '请求过于频繁' },
        { status: 429 },
      );
    }

    const updated = updateHeartbeat(phone, deviceId, deviceToken);
    if (!updated) {
      return NextResponse.json(
        { success: false, message: '设备未注册' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      status: 'online',
      lastHeartbeat: updated.lastHeartbeat,
    });
  } catch (error) {
    console.error('[Device Heartbeat] Error:', error);
    return NextResponse.json(
      { success: false, message: '心跳更新失败' },
      { status: 500 },
    );
  }
}
