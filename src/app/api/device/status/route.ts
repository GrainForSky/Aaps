import { NextRequest, NextResponse } from 'next/server';
import { getDeviceStatus } from '@/lib/store';

/**
 * GET /api/device/status?phone=xxx
 * Web 前端查询设备在线状态
 * 需要验证用户登录手机号与查询设备一致
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

    // Verify user is logged in
    const sessionHeader = request.headers.get('x-user-phone');
    if (!sessionHeader) {
      return NextResponse.json(
        { success: false, message: '未登录，请先登录' },
        { status: 401 },
      );
    }

    // Verify user can only query their own device
    if (sessionHeader !== phone) {
      return NextResponse.json(
        { success: false, message: '无权查询此设备状态' },
        { status: 403 },
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
