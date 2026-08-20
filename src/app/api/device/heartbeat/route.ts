import { NextRequest, NextResponse } from 'next/server';
import { updateHeartbeat } from '@/lib/store';

/**
 * POST /api/device/heartbeat
 * AndroidAPS 设备心跳接口
 * 设备每 30 秒调用一次，保持在线状态
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, deviceId } = body;

    if (!phone || !deviceId) {
      return NextResponse.json(
        { success: false, message: '缺少 phone 或 deviceId 参数' },
        { status: 400 },
      );
    }

    const device = updateHeartbeat(phone, deviceId);

    if (!device) {
      return NextResponse.json(
        { success: false, message: '设备未注册，请先调用 /api/device/register' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      status: device.status,
      lastHeartbeat: device.lastHeartbeat,
    });
  } catch (error) {
    console.error('[Device Heartbeat] Error:', error);
    return NextResponse.json(
      { success: false, message: '心跳更新失败' },
      { status: 500 },
    );
  }
}
