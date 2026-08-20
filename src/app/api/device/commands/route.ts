import { NextRequest, NextResponse } from 'next/server';
import { getPendingCommands } from '@/lib/store';

/**
 * GET /api/device/commands?phone=xxx
 * AndroidAPS 设备轮询待执行命令
 * 设备每 5 秒调用一次，获取待执行的命令
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

    const commands = getPendingCommands(phone);

    // 标记为执行中
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
