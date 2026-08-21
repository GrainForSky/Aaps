import { NextRequest, NextResponse } from 'next/server';
import { getCommand, getDeviceStatus } from '@/lib/store';

/**
 * GET /api/command/status?id=xxx&phone=xxx
 * Web 前端查询命令执行状态
 * 需要验证用户登录手机号与命令所属设备一致
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const phone = searchParams.get('phone');

    if (!id) {
      return NextResponse.json(
        { success: false, message: '缺少 id 参数' },
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

    const command = getCommand(id);

    if (!command) {
      return NextResponse.json(
        { success: false, message: '命令不存在' },
        { status: 404 },
      );
    }

    // Verify command belongs to this user
    if (command.phone !== sessionHeader) {
      return NextResponse.json(
        { success: false, message: '无权查看此命令' },
        { status: 403 },
      );
    }

    // If phone param provided, verify it matches
    if (phone && phone !== sessionHeader) {
      return NextResponse.json(
        { success: false, message: '无权查看此设备的命令' },
        { status: 403 },
      );
    }

    // 如果传了 phone，同时返回设备状态
    const deviceStatus = phone ? getDeviceStatus(phone) : undefined;

    return NextResponse.json({
      success: true,
      command: {
        id: command.id,
        type: command.type,
        insulin: command.insulin,
        carbs: command.carbs,
        status: command.status,
        createdAt: command.createdAt,
        executedAt: command.executedAt,
        result: command.result,
        expiresAt: command.expiresAt,
      },
      deviceStatus,
    });
  } catch (error) {
    console.error('[Command Status] Error:', error);
    return NextResponse.json(
      { success: false, message: '查询失败' },
      { status: 500 },
    );
  }
}
