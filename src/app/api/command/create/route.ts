import { NextRequest, NextResponse } from 'next/server';
import { createCommand, getDeviceStatus, checkRateLimit } from '@/lib/store';
import { SAFETY_RULES, RATE_LIMITS, PHONE_REGEX } from '@/lib/types';
import type { CreateCommandRequest, CreateCommandResponse } from '@/lib/types';

/**
 * POST /api/command/create
 * Web 前端创建远程控制命令
 * 需要验证用户登录手机号与目标设备一致
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateCommandRequest = await request.json();
    const { phone, type, insulin, carbs } = body;

    // Input validation
    if (!phone || !type) {
      return NextResponse.json(
        { success: false, commandId: '', message: '缺少 phone 或 type 参数' },
        { status: 400 },
      );
    }

    if (!PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        { success: false, commandId: '', message: '无效的手机号格式' },
        { status: 400 },
      );
    }

    // Verify user is logged in and phone matches
    const sessionHeader = request.headers.get('x-user-phone');
    if (!sessionHeader) {
      return NextResponse.json(
        { success: false, commandId: '', message: '未登录，请先登录' },
        { status: 401 },
      );
    }

    if (sessionHeader !== phone) {
      return NextResponse.json(
        { success: false, commandId: '', message: '无权操作此设备，登录手机号与目标设备不一致' },
        { status: 403 },
      );
    }

    // Rate limiting
    const rateLimit = checkRateLimit(`command:${phone}`, RATE_LIMITS.COMMAND_CREATE);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, commandId: '', message: '请求过于频繁，请稍后再试' },
        { status: 429 },
      );
    }

    // Check device is online
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

    // Safety checks
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
