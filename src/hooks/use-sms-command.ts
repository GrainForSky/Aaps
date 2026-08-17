'use client';

import { useState, useCallback, useRef } from 'react';
import type { SMSGatewayConfig, SMSSendResult, TreatmentRecord } from '@/lib/types';

/** 输注确认状态 */
export type DeliveryConfirmStatus =
  | 'idle'           // 空闲
  | 'sending_sms'    // 正在发送短信
  | 'sms_sent'       // 短信已发送，等待确认
  | 'confirming'     // 正在通过 Nightscout 确认
  | 'confirmed'      // 已确认输注成功
  | 'timeout'        // 确认超时
  | 'failed';        // 发送或确认失败

/** 输注确认结果 */
export interface DeliveryConfirmResult {
  status: DeliveryConfirmStatus;
  smsResult?: SMSSendResult;
  treatment?: TreatmentRecord;
  message: string;
  timestamp: number;
}

interface UseSMSCommandReturn {
  sendAndConfirm: (
    type: 'bolus' | 'carbs' | 'mixed',
    params: { insulin?: number; carbs?: number },
    nightscoutUrl: string,
    apiSecret: string,
  ) => Promise<DeliveryConfirmResult>;
  status: DeliveryConfirmStatus;
  result: DeliveryConfirmResult | null;
  isSending: boolean;
  clearResult: () => void;
}

/**
 * SMS 命令发送 + Nightscout 输注结果确认 Hook
 *
 * 流程：
 * 1. 通过 SMS 网关发送命令到 AndroidAPS 手机
 * 2. 等待 5 秒（让 AndroidAPS 执行并上传到 Nightscout）
 * 3. 轮询 Nightscout /api/v1/treatments 查找匹配的治疗记录
 * 4. 找到匹配记录 → 确认成功；超时 60 秒未找到 → 超时
 */
export function useSMSCommand(gateway: SMSGatewayConfig | null): UseSMSCommandReturn {
  const [status, setStatus] = useState<DeliveryConfirmStatus>('idle');
  const [result, setResult] = useState<DeliveryConfirmResult | null>(null);
  const abortRef = useRef(false);

  /**
   * 轮询 Nightscout 查找匹配的治疗记录
   * 在发送 SMS 后的指定时间内反复查询，直到找到匹配记录或超时
   */
  const pollNightscoutForTreatment = useCallback(
    async (
      type: 'bolus' | 'carbs' | 'mixed',
      params: { insulin?: number; carbs?: number },
      nightscoutUrl: string,
      apiSecret: string,
      sentAt: number,
    ): Promise<{ found: boolean; treatment?: TreatmentRecord }> => {
      const MAX_POLL_TIME = 60_000; // 最长等待 60 秒
      const POLL_INTERVAL = 5_000;   // 每 5 秒轮询一次
      const startTime = Date.now();

      while (Date.now() - startTime < MAX_POLL_TIME) {
        if (abortRef.current) return { found: false };

        try {
          const headers: Record<string, string> = {};
          if (apiSecret) {
            // SHA1 hash for Nightscout API
            const encoder = new TextEncoder();
            const data = encoder.encode(apiSecret);
            const hashBuffer = await crypto.subtle.digest('SHA-1', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            headers['api-secret'] = hashHex;
          }

          const count = 10;
          const url = `${nightscoutUrl}/api/v1/treatments?count=${count}`;
          const res = await fetch(url, { headers });

          if (!res.ok) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL));
            continue;
          }

          const treatments: TreatmentRecord[] = await res.json();

          // 查找匹配的治疗记录
          for (const t of treatments) {
            const treatmentTime = new Date(t.created_at || '').getTime();
            // 记录时间应在发送时间之后（允许 5 秒误差）
            if (treatmentTime < sentAt - 5000) continue;
            // 记录时间不应超过当前时间 + 10 秒（排除未来记录）
            if (treatmentTime > Date.now() + 10000) continue;

            if (type === 'bolus' || type === 'mixed') {
              if (t.eventType === 'Bolus' && t.insulin !== undefined) {
                // 匹配胰岛素剂量（允许 0.1U 误差）
                if (params.insulin !== undefined && Math.abs(t.insulin - params.insulin) < 0.15) {
                  return { found: true, treatment: t };
                }
              }
            }

            if (type === 'carbs' || type === 'mixed') {
              if (t.eventType === 'Carbs' && t.carbs !== undefined) {
                // 匹配碳水剂量（允许 1g 误差）
                if (params.carbs !== undefined && Math.abs(t.carbs - params.carbs) < 1.5) {
                  return { found: true, treatment: t };
                }
              }
            }

            // 混合输注可能记录为一条 Combined 记录
            if (type === 'mixed' && (t.eventType === 'Combined' || t.eventType === 'Meal Bolus')) {
              const insulinMatch = params.insulin === undefined || (t.insulin !== undefined && Math.abs(t.insulin - params.insulin) < 0.15);
              const carbsMatch = params.carbs === undefined || (t.carbs !== undefined && Math.abs(t.carbs - params.carbs) < 1.5);
              if (insulinMatch && carbsMatch) {
                return { found: true, treatment: t };
              }
            }
          }
        } catch {
          // 网络错误，继续轮询
        }

        // 等待后重试
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
      }

      return { found: false };
    },
    []
  );

  const sendAndConfirm = useCallback(
    async (
      type: 'bolus' | 'carbs' | 'mixed',
      params: { insulin?: number; carbs?: number },
      nightscoutUrl: string,
      apiSecret: string,
    ): Promise<DeliveryConfirmResult> => {
      if (!gateway) {
        const r: DeliveryConfirmResult = { status: 'failed', message: 'SMS 网关未配置', timestamp: Date.now() };
        setResult(r);
        return r;
      }

      abortRef.current = false;

      // Step 1: 发送 SMS
      setStatus('sending_sms');
      setResult({ status: 'sending_sms', message: '正在发送短信命令...', timestamp: Date.now() });

      const sentAt = Date.now();
      let smsResult: SMSSendResult;

      try {
        const res = await fetch('/api/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gateway, commandType: type, params }),
        });
        const data = await res.json();
        smsResult = {
          success: data.success,
          messageId: data.data?.messageId,
          error: data.error,
        };
      } catch (err) {
        const r: DeliveryConfirmResult = {
          status: 'failed',
          message: `短信发送失败: ${err instanceof Error ? err.message : '未知错误'}`,
          timestamp: Date.now(),
        };
        setStatus('failed');
        setResult(r);
        return r;
      }

      if (!smsResult.success) {
        const r: DeliveryConfirmResult = {
          status: 'failed',
          smsResult,
          message: `短信发送失败: ${smsResult.error || '未知错误'}`,
          timestamp: Date.now(),
        };
        setStatus('failed');
        setResult(r);
        return r;
      }

      // Step 2: 短信已发送，等待 AndroidAPS 执行
      setStatus('sms_sent');
      setResult({
        status: 'sms_sent',
        smsResult,
        message: '短信已发送，等待 AndroidAPS 执行...',
        timestamp: Date.now(),
      });

      // 等待 5 秒让 AndroidAPS 处理并上传到 Nightscout
      await new Promise(r => setTimeout(r, 5000));

      if (abortRef.current) {
        const r: DeliveryConfirmResult = {
          status: 'sms_sent',
          smsResult,
          message: '已取消确认',
          timestamp: Date.now(),
        };
        setResult(r);
        return r;
      }

      // Step 3: 轮询 Nightscout 确认结果
      setStatus('confirming');
      setResult({
        status: 'confirming',
        smsResult,
        message: '正在通过 Nightscout 确认输注结果...',
        timestamp: Date.now(),
      });

      const { found, treatment } = await pollNightscoutForTreatment(
        type, params, nightscoutUrl, apiSecret, sentAt
      );

      if (found && treatment) {
        const r: DeliveryConfirmResult = {
          status: 'confirmed',
          smsResult,
          treatment,
          message: buildConfirmMessage(type, params, treatment),
          timestamp: Date.now(),
        };
        setStatus('confirmed');
        setResult(r);
        return r;
      } else {
        const r: DeliveryConfirmResult = {
          status: 'timeout',
          smsResult,
          message: '短信已发送，但在 Nightscout 中未找到匹配的治疗记录。请检查 AndroidAPS 是否在线，或手动确认输注是否成功。',
          timestamp: Date.now(),
        };
        setStatus('timeout');
        setResult(r);
        return r;
      }
    },
    [gateway, pollNightscoutForTreatment]
  );

  const clearResult = useCallback(() => {
    abortRef.current = true;
    setStatus('idle');
    setResult(null);
  }, []);

  return {
    sendAndConfirm,
    status,
    result,
    isSending: status === 'sending_sms' || status === 'confirming',
    clearResult,
  };
}

function buildConfirmMessage(
  type: 'bolus' | 'carbs' | 'mixed',
  params: { insulin?: number; carbs?: number },
  treatment: TreatmentRecord,
): string {
  const parts: string[] = ['输注已确认'];
  if (type === 'bolus' || type === 'mixed') {
    parts.push(`胰岛素 ${treatment.insulin ?? params.insulin}U`);
  }
  if (type === 'carbs' || type === 'mixed') {
    parts.push(`碳水 ${treatment.carbs ?? params.carbs}g`);
  }
  parts.push('已成功记录到 Nightscout');
  return parts.join('，');
}
