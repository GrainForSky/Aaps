import { NextRequest, NextResponse } from 'next/server';
import { getDeviceStatus } from '@/lib/store';

/**
 * GET /api/device/status?phone=xxx
 * Web 前端查询设备在线状态
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json(
        { success: false, message: '缺少 phone 参数' },
        { status: 400 },
      );
    }

    const status = getDeviceStatus(phone);

    return NextResponse.json({
      success: true,
      phone,
      status,
    });
  } catch (error) {
    console.error('[Device Status] Error:', error);
    return NextResponse.json(
      { success: false, message: '查询失败' },
      { status: 500 },
    );
  }
}
