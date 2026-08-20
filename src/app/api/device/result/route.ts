import { NextRequest, NextResponse } from 'next/server';
import { updateCommandStatus } from '@/lib/store';
import type { ReportResultRequest } from '@/lib/types';

/**
 * POST /api/device/result
 * AndroidAPS 设备上报命令执行结果
 */
export async function POST(request: NextRequest) {
  try {
    const body: ReportResultRequest = await request.json();
    const { commandId, phone, deviceId, success, message, treatmentId } = body;

    if (!commandId || !phone) {
      return NextResponse.json(
        { success: false, message: '缺少 commandId 或 phone 参数' },
        { status: 400 },
      );
    }

    const command = updateCommandStatus(commandId, success ? 'completed' : 'failed', {
      success,
      message,
      treatmentId,
    });

    if (!command) {
      return NextResponse.json(
        { success: false, message: '命令不存在' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: '结果上报成功',
      command: {
        id: command.id,
        status: command.status,
        result: command.result,
      },
    });
  } catch (error) {
    console.error('[Device Result] Error:', error);
    return NextResponse.json(
      { success: false, message: '结果上报失败' },
      { status: 500 },
    );
  }
}
