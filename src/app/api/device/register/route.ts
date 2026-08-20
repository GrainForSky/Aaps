import { NextRequest, NextResponse } from 'next/server';
import { registerDevice } from '@/lib/store';
import type { DeviceRegisterRequest, DeviceRegisterResponse } from '@/lib/types';

/**
 * POST /api/device/register
 * AndroidAPS 设备注册接口
 * 设备启动时调用，注册手机号和设备ID
 */
export async function POST(request: NextRequest) {
  try {
    const body: DeviceRegisterRequest = await request.json();
    const { phone, deviceId, appVersion } = body;

    if (!phone || !deviceId) {
      return NextResponse.json(
        { success: false, message: '缺少 phone 或 deviceId 参数' },
        { status: 400 },
      );
    }

    const device = registerDevice(phone, deviceId, appVersion || '3.4');

    const response: DeviceRegisterResponse = {
      success: true,
      message: `设备 ${deviceId} 注册成功`,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Device Register] Error:', error);
    return NextResponse.json(
      { success: false, message: '注册失败' },
      { status: 500 },
    );
  }
}
