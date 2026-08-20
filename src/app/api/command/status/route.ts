import { NextRequest, NextResponse } from 'next/server';
import { getCommand, getDeviceStatus } from '@/lib/store';

/**
 * GET /api/command/status?id=xxx
 * Web 前端查询命令执行状态
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

    const command = getCommand(id);

    if (!command) {
      return NextResponse.json(
        { success: false, message: '命令不存在' },
        { status: 404 },
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
