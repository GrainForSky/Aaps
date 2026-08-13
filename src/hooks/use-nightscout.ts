'use client';

import { useState, useCallback } from 'react';
import type { NightscoutConfig, Treatment, TreatmentRecord, CGMEntry, DeviceStatus } from '@/lib/types';

export function useNightscout() {
  const [config, setConfig] = useState<NightscoutConfig | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [treatments, setTreatments] = useState<TreatmentRecord[]>([]);
  const [cgmEntries, setCGMEntries] = useState<CGMEntry[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);

  const testConnection = useCallback(async (cfg: NightscoutConfig) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/nightscout/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nightscoutUrl: cfg.url, apiSecret: cfg.apiSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Connection failed');
      setConfig(cfg);
      setIsConnected(true);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
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
      const res = await fetch(
        `/api/nightscout/treatments?url=${encodeURIComponent(config.url)}&secret=${encodeURIComponent(config.apiSecret)}&count=20`
      );
      const data = await res.json();
      if (data.success) setTreatments(data.data);
    } catch (err) {
      console.error('Failed to fetch treatments:', err);
    }
  }, [config]);

  const fetchCGMEntries = useCallback(async () => {
    if (!config) return;
    try {
      const res = await fetch(
        `/api/nightscout/entries?url=${encodeURIComponent(config.url)}&secret=${encodeURIComponent(config.apiSecret)}&count=12`
      );
      const data = await res.json();
      if (data.success) setCGMEntries(data.data);
    } catch (err) {
      console.error('Failed to fetch CGM entries:', err);
    }
  }, [config]);

  const fetchDeviceStatus = useCallback(async () => {
    if (!config) return;
    try {
      const res = await fetch(
        `/api/nightscout/status?url=${encodeURIComponent(config.url)}&secret=${encodeURIComponent(config.apiSecret)}&count=1`
      );
      const data = await res.json();
      if (data.success && data.data.length > 0) setDeviceStatus(data.data[0]);
    } catch (err) {
      console.error('Failed to fetch device status:', err);
    }
  }, [config]);

  const submitTreatment = useCallback(async (treatment: Treatment) => {
    if (!config) throw new Error('Not connected');
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/nightscout/treatments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nightscoutUrl: config.url,
          apiSecret: config.apiSecret,
          treatment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit treatment');
      // Refresh treatments after submission
      await fetchTreatments();
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit treatment';
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
    testConnection,
    fetchTreatments,
    fetchCGMEntries,
    fetchDeviceStatus,
    submitTreatment,
    disconnect,
    setError,
  };
}
