import { NextRequest, NextResponse } from 'next/server';
import { updateCommandStatus, validateDeviceToken, getCommand } from '@/lib/store';
import type { ReportResultRequest } from '@/lib/types';

/**
 * POST /api/device/result
 * 设备上报命令执行结果
 * 需要 deviceToken 认证
 */
export async function POST(request: NextRequest) {
  try {
    const body: ReportResultRequest = await request.json();
    const { commandId, phone, deviceId, deviceToken, success, message, treatmentId } = body;

    if (!commandId || !phone || !deviceId || !deviceToken) {
      return NextResponse.json(
        { success: false, message: '缺少必要参数' },
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

    // Verify command belongs to this device
    const command = getCommand(commandId);
    if (!command) {
      return NextResponse.json(
        { success: false, message: '命令不存在' },
        { status: 404 },
      );
    }

    if (command.phone !== phone) {
      return NextResponse.json(
        { success: false, message: '命令不属于此设备' },
        { status: 403 },
      );
    }

    const updated = updateCommandStatus(commandId, success ? 'completed' : 'failed', {
      success,
      message,
      treatmentId,
    });

    return NextResponse.json({
      success: true,
      message: '结果上报成功',
      command: updated,
    });
  } catch (error) {
    console.error('[Device Result] Error:', error);
    return NextResponse.json(
      { success: false, message: '结果上报失败' },
      { status: 500 },
    );
  }
}
