import { NextRequest, NextResponse } from 'next/server';
import { getPendingCommands, validateDeviceToken } from '@/lib/store';

/**
 * GET /api/device/commands?phone=xxx&deviceId=xxx&deviceToken=xxx
 * 设备轮询待执行命令（每 5 秒调用一次）
 * 需要 deviceToken 认证
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const deviceId = searchParams.get('deviceId');
    const deviceToken = searchParams.get('deviceToken');

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

    const commands = getPendingCommands(phone);

    // Mark commands as executing when returned to device
    for (const cmd of commands) {
      cmd.status = 'executing';
    }

    return NextResponse.json({
      success: true,
      commands,
    });
  } catch (error) {
    console.error('[Device Commands] Error:', error);
    return NextResponse.json(
      { success: false, message: '获取命令失败' },
      { status: 500 },
    );
  }
}
