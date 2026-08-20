import { NextRequest, NextResponse } from 'next/server';
import { createCommand, getDeviceStatus } from '@/lib/store';
import type { CreateCommandRequest, CreateCommandResponse } from '@/lib/types';
import { SAFETY_RULES } from '@/lib/types';

/**
 * POST /api/command/create
 * Web 前端创建远程控制命令
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateCommandRequest = await request.json();
    const { phone, type, insulin, carbs } = body;

    if (!phone || !type) {
      return NextResponse.json(
        { success: false, commandId: '', message: '缺少 phone 或 type 参数' },
        { status: 400 },
      );
    }

    // 检查设备是否在线
    const deviceStatus = getDeviceStatus(phone);
    if (deviceStatus === 'not_registered') {
      return NextResponse.json(
        { success: false, commandId: '', message: '设备未注册，请先在 AndroidAPS 手机上安装并启动远程插件' },
        { status: 400 },
      );
    }
    if (deviceStatus === 'offline') {
      return NextResponse.json(
        { success: false, commandId: '', message: '设备离线，请确保 AndroidAPS 手机已联网并启动远程插件' },
        { status: 400 },
      );
    }

    // 安全检查
    if (type === 'bolus' || type === 'mixed') {
      if (!insulin || insulin <= 0) {
        return NextResponse.json(
          { success: false, commandId: '', message: '胰岛素剂量必须大于 0' },
          { status: 400 },
        );
      }
      if (insulin > SAFETY_RULES.MAX_BOLUS_UNITS) {
        return NextResponse.json(
          { success: false, commandId: '', message: `胰岛素剂量不能超过 ${SAFETY_RULES.MAX_BOLUS_UNITS}U` },
          { status: 400 },
        );
      }
    }

    if (type === 'carbs' || type === 'mixed') {
      if (!carbs || carbs <= 0) {
        return NextResponse.json(
          { success: false, commandId: '', message: '碳水剂量必须大于 0' },
          { status: 400 },
        );
      }
      if (carbs > SAFETY_RULES.MAX_CARBS_GRAMS) {
        return NextResponse.json(
          { success: false, commandId: '', message: `碳水剂量不能超过 ${SAFETY_RULES.MAX_CARBS_GRAMS}g` },
          { status: 400 },
        );
      }
    }

    const command = createCommand(phone, type, insulin, carbs);

    const response: CreateCommandResponse = {
      success: true,
      commandId: command.id,
      message: `命令已创建，等待设备执行`,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Command Create] Error:', error);
    return NextResponse.json(
      { success: false, commandId: '', message: '命令创建失败' },
      { status: 500 },
    );
  }
}
