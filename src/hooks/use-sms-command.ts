'use client';

import { useState, useCallback } from 'react';
import type { SMSGatewayConfig, SMSSendResult } from '@/lib/types';

interface UseSMSCommandReturn {
  sendCommand: (type: string, params: Record<string, number | string>) => Promise<SMSSendResult>;
  isSending: boolean;
  lastResult: SMSSendResult | null;
  clearResult: () => void;
}

export function useSMSCommand(gateway: SMSGatewayConfig | null): UseSMSCommandReturn {
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<SMSSendResult | null>(null);

  const sendCommand = useCallback(
    async (type: string, params: Record<string, number | string>): Promise<SMSSendResult> => {
      if (!gateway) {
        return { success: false, error: 'SMS 网关未配置' };
      }

      setIsSending(true);
      setLastResult(null);

      try {
        const res = await fetch('/api/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gateway, commandType: type, params }),
        });

        const data = await res.json();

        const result: SMSSendResult = {
          success: data.success,
          messageId: data.data?.messageId,
          error: data.error,
        };

        setLastResult(result);
        return result;
      } catch (err) {
        const result: SMSSendResult = {
          success: false,
          error: `发送失败: ${err instanceof Error ? err.message : '未知错误'}`,
        };
        setLastResult(result);
        return result;
      } finally {
        setIsSending(false);
      }
    },
    [gateway]
  );

  const clearResult = useCallback(() => {
    setLastResult(null);
  }, []);

  return { sendCommand, isSending, lastResult, clearResult };
}
