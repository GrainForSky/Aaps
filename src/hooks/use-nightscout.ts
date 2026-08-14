'use client';

import { useState, useCallback } from 'react';
import type { AppConfig, Treatment, TreatmentRecord, CGMEntry, DeviceStatus, SMSGatewayConfig } from '@/lib/types';

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

  const testSMSConnection = useCallback(async (
    gateway: SMSGatewayConfig,
    dataSourceMode: 'nightscout' | 'direct',
    dataSourceConfig: { url: string; apiSecret?: string; token?: string }
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      // Test SMS gateway by sending a STATUS command
      const res = await fetch('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway,
          action: 'status',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SMS 网关连接失败');

      // Test data source connection
      if (dataSourceMode === 'nightscout' && dataSourceConfig.apiSecret) {
        const nsRes = await fetch('/api/nightscout/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nightscoutUrl: dataSourceConfig.url,
            apiSecret: dataSourceConfig.apiSecret,
          }),
        });
        const nsData = await nsRes.json();
        if (!nsRes.ok) throw new Error(nsData.error || '数据源连接失败');
      } else if (dataSourceMode === 'direct') {
        const directRes = await fetch('/api/direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceUrl: dataSourceConfig.url,
            token: dataSourceConfig.token,
            action: 'ping',
          }),
        });
        const directData = await directRes.json();
        if (!directRes.ok) throw new Error(directData.error || '数据源连接失败');
      }

      setConfig({
        mode: 'sms',
        gateway,
        dataSource: {
          mode: dataSourceMode,
          nightscout: dataSourceMode === 'nightscout'
            ? { url: dataSourceConfig.url, apiSecret: dataSourceConfig.apiSecret || '' }
            : undefined,
          direct: dataSourceMode === 'direct'
            ? { url: dataSourceConfig.url, token: dataSourceConfig.token }
            : undefined,
        },
      });
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

  // Helper to get data source config for reading data
  const getDataSourceConfig = useCallback(() => {
    if (!config) return null;
    if (config.mode === 'nightscout') return { mode: 'nightscout' as const, url: config.url, apiSecret: config.apiSecret };
    if (config.mode === 'direct') return { mode: 'direct' as const, url: config.url, token: config.token };
    if (config.mode === 'sms') {
      if (config.dataSource.mode === 'nightscout' && config.dataSource.nightscout) {
        return { mode: 'nightscout' as const, url: config.dataSource.nightscout.url, apiSecret: config.dataSource.nightscout.apiSecret };
      }
      if (config.dataSource.mode === 'direct' && config.dataSource.direct) {
        return { mode: 'direct' as const, url: config.dataSource.direct.url, token: config.dataSource.direct.token };
      }
    }
    return null;
  }, [config]);

  const fetchTreatments = useCallback(async () => {
    const ds = getDataSourceConfig();
    if (!ds) return;
    try {
      let res: Response;
      if (ds.mode === 'nightscout') {
        res = await fetch(
          `/api/nightscout/treatments?url=${encodeURIComponent(ds.url)}&secret=${encodeURIComponent(ds.apiSecret)}&count=20`
        );
      } else {
        res = await fetch(
          `/api/direct?url=${encodeURIComponent(ds.url)}&token=${encodeURIComponent(ds.token || '')}&action=treatments&count=20`
        );
      }
      const data = await res.json();
      if (data.success) setTreatments(data.data);
    } catch (err) {
      console.error('Failed to fetch treatments:', err);
    }
  }, [getDataSourceConfig]);

  const fetchCGMEntries = useCallback(async () => {
    const ds = getDataSourceConfig();
    if (!ds) return;
    try {
      let res: Response;
      if (ds.mode === 'nightscout') {
        res = await fetch(
          `/api/nightscout/entries?url=${encodeURIComponent(ds.url)}&secret=${encodeURIComponent(ds.apiSecret)}&count=12`
        );
      } else {
        res = await fetch(
          `/api/direct?url=${encodeURIComponent(ds.url)}&token=${encodeURIComponent(ds.token || '')}&action=cgm&count=12`
        );
      }
      const data = await res.json();
      if (data.success) setCGMEntries(data.data);
    } catch (err) {
      console.error('Failed to fetch CGM entries:', err);
    }
  }, [getDataSourceConfig]);

  const fetchDeviceStatus = useCallback(async () => {
    const ds = getDataSourceConfig();
    if (!ds) return;
    try {
      let res: Response;
      if (ds.mode === 'nightscout') {
        res = await fetch(
          `/api/nightscout/status?url=${encodeURIComponent(ds.url)}&secret=${encodeURIComponent(ds.apiSecret)}&count=1`
        );
      } else {
        res = await fetch(
          `/api/direct?url=${encodeURIComponent(ds.url)}&token=${encodeURIComponent(ds.token || '')}&action=status`
        );
      }
      const data = await res.json();
      if (data.success) {
        if (ds.mode === 'nightscout' && Array.isArray(data.data) && data.data.length > 0) {
          setDeviceStatus(data.data[0]);
        } else if (ds.mode === 'direct') {
          setDeviceStatus(data.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch device status:', err);
    }
  }, [getDataSourceConfig]);

  const submitTreatment = useCallback(async (treatment: Treatment) => {
    if (!config) throw new Error('未连接');
    setIsLoading(true);
    setError(null);
    try {
      let res: Response;

      if (config.mode === 'sms') {
        // SMS mode: send commands via SMS gateway
        const results = [];

        if (treatment.insulin && treatment.insulin > 0) {
          const insulinRes = await fetch('/api/sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gateway: config.gateway,
              action: 'bolus',
              value: treatment.insulin,
            }),
          });
          const insulinData = await insulinRes.json();
          if (!insulinRes.ok) throw new Error(insulinData.error || '胰岛素短信发送失败');
          results.push(insulinData);
        }

        if (treatment.carbs && treatment.carbs > 0) {
          const carbsRes = await fetch('/api/sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gateway: config.gateway,
              action: 'carbs',
              value: treatment.carbs,
            }),
          });
          const carbsData = await carbsRes.json();
          if (!carbsRes.ok) throw new Error(carbsData.error || '碳水短信发送失败');
          results.push(carbsData);
        }

        // Wait a moment for SMS to be processed, then refresh data
        await new Promise(resolve => setTimeout(resolve, 2000));
        await fetchTreatments();
        return { success: true, data: results };
      } else if (config.mode === 'nightscout') {
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
    setError,
    treatments,
    cgmEntries,
    deviceStatus,
    testNightscoutConnection,
    testDirectConnection,
    testSMSConnection,
    fetchTreatments,
    fetchCGMEntries,
    fetchDeviceStatus,
    submitTreatment,
    disconnect,
  };
}
