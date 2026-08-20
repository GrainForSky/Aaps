'use client';

import { useState, useCallback, useRef } from 'react';
import type { CommandType, RemoteCommand } from '@/lib/types';

/** 命令执行状态 */
export type CommandExecStatus =
  | 'idle'           // 空闲
  | 'creating'       // 正在创建命令
  | 'pending'        // 命令已创建，等待设备执行
  | 'executing'      // 设备正在执行
  | 'completed'      // 执行成功
  | 'failed'         // 执行失败
  | 'expired';       // 命令过期

/** 命令执行结果 */
export interface CommandExecResult {
  status: CommandExecStatus;
  commandId?: string;
  message: string;
  timestamp: number;
}

interface UseRemoteCommandReturn {
  sendCommand: (
    type: CommandType,
    params: { insulin?: number; carbs?: number },
  ) => Promise<CommandExecResult>;
  status: CommandExecStatus;
  result: CommandExecResult | null;
  isSending: boolean;
  clearResult: () => void;
}

/**
 * 远程命令发送 Hook
 *
 * 流程：
 * 1. 调用 /api/command/create 创建命令
 * 2. 每 3 秒轮询 /api/command/status 查询命令状态
 * 3. 最长等待 120 秒
 * 4. 状态流转：idle → creating → pending → executing → completed/failed/expired
 */
export function useRemoteCommand(phone: string): UseRemoteCommandReturn {
  const [status, setStatus] = useState<CommandExecStatus>('idle');
  const [result, setResult] = useState<CommandExecResult | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
  }, []);

  const pollCommandStatus = useCallback(async (commandId: string) => {
    try {
      const res = await fetch(`/api/command/status?id=${encodeURIComponent(commandId)}&phone=${encodeURIComponent(phone)}`);
      const data = await res.json();

      if (!data.success) {
        setStatus('failed');
        setResult({
          status: 'failed',
          commandId,
          message: data.message || '查询命令状态失败',
          timestamp: Date.now(),
        });
        clearTimers();
        return;
      }

      const cmd: RemoteCommand = data.command;

      if (cmd.status === 'completed') {
        setStatus('completed');
        setResult({
          status: 'completed',
          commandId,
          message: cmd.result?.message || '命令执行成功',
          timestamp: Date.now(),
        });
        clearTimers();
      } else if (cmd.status === 'failed') {
        setStatus('failed');
        setResult({
          status: 'failed',
          commandId,
          message: cmd.result?.message || '命令执行失败',
          timestamp: Date.now(),
        });
        clearTimers();
      } else if (cmd.status === 'expired') {
        setStatus('expired');
        setResult({
          status: 'expired',
          commandId,
          message: '命令已过期，设备未响应（超时 5 分钟）',
          timestamp: Date.now(),
        });
        clearTimers();
      } else if (cmd.status === 'executing') {
        setStatus('executing');
      } else {
        setStatus('pending');
      }
    } catch {
      // 网络错误，继续轮询
    }
  }, [phone, clearTimers]);

  const sendCommand = useCallback(async (
    type: CommandType,
    params: { insulin?: number; carbs?: number },
  ): Promise<CommandExecResult> => {
    // Clear any previous state
    clearTimers();
    setStatus('creating');
    setResult(null);

    try {
      // Step 1: Create command
      const createRes = await fetch('/api/command/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          type,
          insulin: params.insulin,
          carbs: params.carbs,
        }),
      });

      const createData = await createRes.json();

      if (!createData.success) {
        const failResult: CommandExecResult = {
          status: 'failed',
          message: createData.message || '命令创建失败',
          timestamp: Date.now(),
        };
        setStatus('failed');
        setResult(failResult);
        return failResult;
      }

      const commandId: string = createData.commandId;

      // Step 2: Start polling
      setStatus('pending');
      setResult({
        status: 'pending',
        commandId,
        message: '命令已创建，等待设备执行...',
        timestamp: Date.now(),
      });

      // Poll every 3 seconds
      pollTimerRef.current = setInterval(() => {
        pollCommandStatus(commandId);
      }, 3000);

      // Timeout after 120 seconds
      timeoutTimerRef.current = setTimeout(() => {
        setStatus('expired');
        setResult({
          status: 'expired',
          commandId,
          message: '等待超时（120 秒），设备未响应',
          timestamp: Date.now(),
        });
        clearTimers();
      }, 120000);

      // Return a promise that resolves when the command completes
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (status === 'completed' || status === 'failed' || status === 'expired') {
            clearInterval(checkInterval);
            if (result) resolve(result);
          }
        }, 500);

        // Also set a max timeout for the promise
        setTimeout(() => {
          clearInterval(checkInterval);
          if (result) resolve(result);
        }, 125000);
      });
    } catch (error) {
      const failResult: CommandExecResult = {
        status: 'failed',
        message: error instanceof Error ? error.message : '网络错误',
        timestamp: Date.now(),
      };
      setStatus('failed');
      setResult(failResult);
      clearTimers();
      return failResult;
    }
  }, [phone, clearTimers, pollCommandStatus, status, result]);

  const clearResult = useCallback(() => {
    clearTimers();
    setStatus('idle');
    setResult(null);
  }, [clearTimers]);

  return {
    sendCommand,
    status,
    result,
    isSending: status !== 'idle' && status !== 'completed' && status !== 'failed' && status !== 'expired',
    clearResult,
  };
}
