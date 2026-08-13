'use client';

import { useState, useCallback } from 'react';
import type { AppConfig, Treatment, TreatmentRecord, CGMEntry, DeviceStatus } from '@/lib/types';

export function useAAPS() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [treatments, setTreatments] = useState<TreatmentRecord[]>([]);
  const [cgmEntries, setCGMEntries] = useState<CGMEntry[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);

  const testNightscoutConnection = useCallback(async (url: string, apiSecret: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/nightscout/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nightscoutUrl: url, apiSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '连接失败');
      setConfig({ mode: 'nightscout', url, apiSecret });
      setIsConnected(true);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '连接失败';
      setError(msg);
      setIsConnected(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const testDirectConnection = useCallback(async (url: string, token?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceUrl: url, token, action: 'ping' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '连接失败');
      setConfig({ mode: 'direct', url, token });
      setIsConnected(true);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '连接失败';
      setError(msg);
      setIsConnected(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTreatments = useCallback(async () => {
    if (!config) return;
    try {
      let res: Response;
      if (config.mode === 'nightscout') {
        res = await fetch(
          `/api/nightscout/treatments?url=${encodeURIComponent(config.url)}&secret=${encodeURIComponent(config.apiSecret)}&count=20`
        );
      } else {
        res = await fetch(
          `/api/direct?url=${encodeURIComponent(config.url)}&token=${encodeURIComponent(config.token || '')}&action=treatments&count=20`
        );
      }
      const data = await res.json();
      if (data.success) setTreatments(data.data);
    } catch (err) {
      console.error('Failed to fetch treatments:', err);
    }
  }, [config]);

  const fetchCGMEntries = useCallback(async () => {
    if (!config) return;
    try {
      let res: Response;
      if (config.mode === 'nightscout') {
        res = await fetch(
          `/api/nightscout/entries?url=${encodeURIComponent(config.url)}&secret=${encodeURIComponent(config.apiSecret)}&count=12`
        );
      } else {
        res = await fetch(
          `/api/direct?url=${encodeURIComponent(config.url)}&token=${encodeURIComponent(config.token || '')}&action=cgm&count=12`
        );
      }
      const data = await res.json();
      if (data.success) setCGMEntries(data.data);
    } catch (err) {
      console.error('Failed to fetch CGM entries:', err);
    }
  }, [config]);

  const fetchDeviceStatus = useCallback(async () => {
    if (!config) return;
    try {
      let res: Response;
      if (config.mode === 'nightscout') {
        res = await fetch(
          `/api/nightscout/status?url=${encodeURIComponent(config.url)}&secret=${encodeURIComponent(config.apiSecret)}&count=1`
        );
      } else {
        res = await fetch(
          `/api/direct?url=${encodeURIComponent(config.url)}&token=${encodeURIComponent(config.token || '')}&action=status`
        );
      }
      const data = await res.json();
      if (data.success) {
        if (config.mode === 'nightscout' && Array.isArray(data.data) && data.data.length > 0) {
          setDeviceStatus(data.data[0]);
        } else if (config.mode === 'direct') {
          setDeviceStatus(data.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch device status:', err);
    }
  }, [config]);

  const submitTreatment = useCallback(async (treatment: Treatment) => {
    if (!config) throw new Error('未连接');
    setIsLoading(true);
    setError(null);
    try {
      let res: Response;
      if (config.mode === 'nightscout') {
        res = await fetch('/api/nightscout/treatments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nightscoutUrl: config.url,
            apiSecret: config.apiSecret,
            treatment,
          }),
        });
      } else {
        // Direct API mode
        const action = treatment.type === 'both' ? 'treatment' : treatment.type === 'insulin' ? 'bolus' : 'carbs';
        res = await fetch('/api/direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceUrl: config.url,
            token: config.token,
            action,
            payload: {
              insulin: treatment.insulin,
              carbs: treatment.carbs,
              notes: treatment.notes,
            },
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交治疗记录失败');
      await fetchTreatments();
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '提交治疗记录失败';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [config, fetchTreatments]);

  const disconnect = useCallback(() => {
    setConfig(null);
    setIsConnected(false);
    setTreatments([]);
    setCGMEntries([]);
    setDeviceStatus(null);
    setError(null);
  }, []);

  return {
    config,
    isConnected,
    isLoading,
    error,
    treatments,
    cgmEntries,
    deviceStatus,
    testNightscoutConnection,
    testDirectConnection,
    fetchTreatments,
    fetchCGMEntries,
    fetchDeviceStatus,
    submitTreatment,
    disconnect,
    setError,
  };
}
