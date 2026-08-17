import { useState, useCallback, useRef } from 'react';
import {
  DirectAPICommandResponse,
  DirectAPICommandResult,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  CommandStatus,
} from '@/lib/types';

interface UseDirectAPIOptions {
  baseUrl: string;
  token?: string;
  retryConfig?: Partial<RetryConfig>;
}

interface CommandState {
  requestId: string | null;
  status: CommandStatus;
  result: DirectAPICommandResult | null;
  error: string | null;
  retryCount: number;
}

/**
 * Hook for Direct HTTP API with retry, result confirmation, and fault tolerance
 */
export function useDirectAPI(options: UseDirectAPIOptions) {
  const { baseUrl, token, retryConfig: userRetryConfig } = options;
  const retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...userRetryConfig };
  
  const [commandState, setCommandState] = useState<CommandState>({
    requestId: null,
    status: 'pending',
    result: null,
    error: null,
    retryCount: 0,
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  /**
   * Send a command to the Direct API with retry logic
   */
  const sendCommand = useCallback(async (
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<DirectAPICommandResponse> => {
    const url = `${baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[DirectAPI] Retry attempt ${attempt}/${retryConfig.maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, retryConfig.retryDelayMs));
        }

        abortControllerRef.current = new AbortController();
        const timeoutId = setTimeout(() => {
          abortControllerRef.current?.abort();
        }, retryConfig.timeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(body),
          signal: abortControllerRef.current.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
        }

        const data: DirectAPICommandResponse = await response.json();
        return data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        
        // Don't retry on client errors (4xx)
        if (lastError.message.includes('HTTP 4')) {
          throw lastError;
        }
        
        console.warn(`[DirectAPI] Attempt ${attempt + 1} failed: ${lastError.message}`);
      }
    }

    throw lastError || new Error('Command failed after all retries');
  }, [baseUrl, getHeaders, retryConfig]);

  /**
   * Poll for command result until completion or timeout
   */
  const pollForResult = useCallback(async (
    requestId: string,
    onProgress?: (status: CommandStatus) => void,
  ): Promise<DirectAPICommandResult> => {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const url = `${baseUrl}/result/${requestId}`;
          const response = await fetch(url, { headers: getHeaders() });

          if (!response.ok) {
            throw new Error(`Failed to get result: HTTP ${response.status}`);
          }

          const result: DirectAPICommandResult = await response.json();
          
          setCommandState(prev => ({
            ...prev,
            status: result.status,
            result,
          }));

          onProgress?.(result.status);

          // Check if command completed
          if (result.status === 'completed' || result.status === 'failed') {
            if (pollTimerRef.current) {
              clearTimeout(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            resolve(result);
            return;
          }

          // Check timeout
          if (Date.now() - startTime > retryConfig.timeoutMs) {
            if (pollTimerRef.current) {
              clearTimeout(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            const timeoutResult: DirectAPICommandResult = {
              requestId,
              type: result.type,
              status: 'timeout',
              requestedAmount: result.requestedAmount,
              deliveredAmount: 0,
              success: false,
              message: `Command timed out after ${retryConfig.timeoutMs / 1000}s`,
              createdAt: result.createdAt,
            };
            setCommandState(prev => ({
              ...prev,
              status: 'timeout',
              result: timeoutResult,
            }));
            resolve(timeoutResult);
            return;
          }

          // Schedule next poll
          pollTimerRef.current = setTimeout(poll, retryConfig.pollIntervalMs);
        } catch (err) {
          // On network error during polling, retry the poll
          console.warn(`[DirectAPI] Poll error: ${err}`);
          pollTimerRef.current = setTimeout(poll, retryConfig.pollIntervalMs * 2);
        }
      };

      // Start polling
      pollTimerRef.current = setTimeout(poll, retryConfig.pollIntervalMs);
    });
  }, [baseUrl, getHeaders, retryConfig]);

  /**
   * Deliver bolus with full retry and confirmation flow
   */
  const deliverBolus = useCallback(async (
    insulin: number,
    onProgress?: (status: CommandStatus, message?: string) => void,
  ): Promise<DirectAPICommandResult> => {
    setCommandState({
      requestId: null,
      status: 'pending',
      result: null,
      error: null,
      retryCount: 0,
    });

    try {
      onProgress?.('pending', 'Sending bolus command...');
      
      const response = await sendCommand('/bolus', { insulin });
      
      setCommandState(prev => ({
        ...prev,
        requestId: response.requestId,
        status: 'executing',
      }));

      onProgress?.('executing', 'Waiting for delivery confirmation...');

      const result = await pollForResult(response.requestId, (status) => {
        onProgress?.(status);
      });

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setCommandState(prev => ({
        ...prev,
        status: 'failed',
        error: errorMessage,
      }));
      onProgress?.('failed', errorMessage);
      
      return {
        requestId: commandState.requestId || 'unknown',
        type: 'bolus',
        status: 'failed',
        requestedAmount: insulin,
        deliveredAmount: 0,
        success: false,
        message: errorMessage,
        createdAt: Date.now(),
      };
    }
  }, [sendCommand, pollForResult, commandState.requestId]);

  /**
   * Record carbs with full retry and confirmation flow
   */
  const recordCarbs = useCallback(async (
    carbs: number,
    onProgress?: (status: CommandStatus, message?: string) => void,
  ): Promise<DirectAPICommandResult> => {
    setCommandState({
      requestId: null,
      status: 'pending',
      result: null,
      error: null,
      retryCount: 0,
    });

    try {
      onProgress?.('pending', 'Sending carbs command...');
      
      const response = await sendCommand('/carbs', { carbs });
      
      setCommandState(prev => ({
        ...prev,
        requestId: response.requestId,
        status: 'executing',
      }));

      onProgress?.('executing', 'Waiting for confirmation...');

      const result = await pollForResult(response.requestId, (status) => {
        onProgress?.(status);
      });

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setCommandState(prev => ({
        ...prev,
        status: 'failed',
        error: errorMessage,
      }));
      onProgress?.('failed', errorMessage);
      
      return {
        requestId: commandState.requestId || 'unknown',
        type: 'carbs',
        status: 'failed',
        requestedAmount: carbs,
        deliveredAmount: 0,
        success: false,
        message: errorMessage,
        createdAt: Date.now(),
      };
    }
  }, [sendCommand, pollForResult, commandState.requestId]);

  /**
   * Deliver combined treatment
   */
  const deliverTreatment = useCallback(async (
    insulin: number,
    carbs: number,
    notes?: string,
    onProgress?: (status: CommandStatus, message?: string) => void,
  ): Promise<DirectAPICommandResult> => {
    setCommandState({
      requestId: null,
      status: 'pending',
      result: null,
      error: null,
      retryCount: 0,
    });

    try {
      onProgress?.('pending', 'Sending treatment command...');
      
      const response = await sendCommand('/treatment', { insulin, carbs, notes });
      
      setCommandState(prev => ({
        ...prev,
        requestId: response.requestId,
        status: 'executing',
      }));

      onProgress?.('executing', 'Waiting for delivery confirmation...');

      const result = await pollForResult(response.requestId, (status) => {
        onProgress?.(status);
      });

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setCommandState(prev => ({
        ...prev,
        status: 'failed',
        error: errorMessage,
      }));
      onProgress?.('failed', errorMessage);
      
      return {
        requestId: commandState.requestId || 'unknown',
        type: 'treatment',
        status: 'failed',
        requestedAmount: insulin + carbs,
        deliveredAmount: 0,
        success: false,
        message: errorMessage,
        createdAt: Date.now(),
      };
    }
  }, [sendCommand, pollForResult, commandState.requestId]);

  /**
   * Cancel ongoing polling
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  /**
   * Reset command state
   */
  const reset = useCallback(() => {
    cancel();
    setCommandState({
      requestId: null,
      status: 'pending',
      result: null,
      error: null,
      retryCount: 0,
    });
  }, [cancel]);

  return {
    commandState,
    deliverBolus,
    recordCarbs,
    deliverTreatment,
    cancel,
    reset,
  };
}
