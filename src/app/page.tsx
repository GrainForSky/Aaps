'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSafetyLock, formatCountdown } from '@/hooks/use-safety-lock';
import { SAFETY_RULES } from '@/lib/types';
import type { SMSGatewayConfig, DirectAPICommandResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Activity, Droplets, Battery, AlertTriangle, Send, Clock,
  Shield, CheckCircle2, XCircle, Loader2, Phone, Settings,
  BarChart3, LogOut, RefreshCw, Lock,
} from 'lucide-react';

/* ─────────────────────── Types ─────────────────────── */

interface AuthState {
  token: string;
  phone: string;
}

interface AppConfig {
  nightscoutUrl: string;
  apiSecret: string;
  deviceUrl: string;
  deviceToken: string;
}

interface NightscoutStatus {
  reservoir: number;
  battery: number;
  isSuspended: boolean;
  isBolusInProgress: boolean;
  pumpType: string;
}

interface CGMEntry {
  sgv: number;
  direction: string;
  date: number;
}

interface TreatmentRecord {
  _id: string;
  eventType: string;
  insulin?: number;
  carbs?: number;
  created_at: string;
  notes?: string;
}

/* ─────────────────────── API Helpers ─────────────────────── */

async function apiLogin(deviceUrl: string, phone: string): Promise<{ token: string }> {
  const res = await fetch('/api/direct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceUrl, action: 'auth', phone }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '登录失败');
  return { token: json.data.token };
}

async function apiBolus(deviceUrl: string, token: string, insulin: number, phone: string): Promise<DirectAPICommandResult> {
  const res = await fetch('/api/direct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceUrl, deviceToken: token, action: 'bolus', insulin, phone }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '输注失败');
  return json.data;
}

async function apiCarbs(deviceUrl: string, token: string, carbs: number, phone: string): Promise<DirectAPICommandResult> {
  const res = await fetch('/api/direct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceUrl, deviceToken: token, action: 'carbs', carbs, phone }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '记录失败');
  return json.data;
}

async function apiStatus(deviceUrl: string, token: string): Promise<NightscoutStatus> {
  const res = await fetch(`/api/direct?deviceUrl=${encodeURIComponent(deviceUrl)}&deviceToken=${encodeURIComponent(token)}&action=status`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '获取状态失败');
  return json.data;
}

async function fetchNSTreatments(nsUrl: string, secret: string, count = 20): Promise<TreatmentRecord[]> {
  const res = await fetch(`/api/nightscout/treatments?url=${encodeURIComponent(nsUrl)}&secret=${encodeURIComponent(secret)}&count=${count}`);
  const json = await res.json();
  if (!json.success) return [];
  return json.data || [];
}

async function fetchNSEntries(nsUrl: string, secret: string, count = 12): Promise<CGMEntry[]> {
  const res = await fetch(`/api/nightscout/entries?url=${encodeURIComponent(nsUrl)}&secret=${encodeURIComponent(secret)}&count=${count}`);
  const json = await res.json();
  if (!json.success) return [];
  return json.data || [];
}

/* ─────────────────────── Login Screen ─────────────────────── */

function LoginScreen({ onLogin }: { onLogin: (auth: AuthState, config: AppConfig) => void }) {
  const [phone, setPhone] = useState('');
  const [deviceUrl, setDeviceUrl] = useState('');
  const [nightscoutUrl, setNightscoutUrl] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!phone.trim()) { setError('请输入手机号'); return; }
    if (!deviceUrl.trim()) { setError('请输入设备地址'); return; }

    setLoading(true);
    setError('');
    try {
      const { token } = await apiLogin(deviceUrl.trim(), phone.trim());
      onLogin(
        { token, phone: phone.trim() },
        {
          nightscoutUrl: nightscoutUrl.trim(),
          apiSecret: apiSecret.trim(),
          deviceUrl: deviceUrl.trim(),
          deviceToken: token,
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-slate-950 to-slate-900">
      <Card className="w-full max-w-md border-slate-700 bg-slate-900/80 backdrop-blur">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/10 ring-1 ring-cyan-500/20">
            <Shield className="h-8 w-8 text-cyan-400" />
          </div>
          <CardTitle className="text-2xl text-white">AndroidAPS 远程控制</CardTitle>
          <CardDescription className="text-slate-400">通过手机号登录，远程管理胰岛素输注</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">手机号</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                className="pl-10 bg-slate-800 border-slate-700 text-white"
                placeholder="请输入注册手机号"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300">设备地址</Label>
            <Input
              className="bg-slate-800 border-slate-700 text-white"
              placeholder="http://192.168.1.100:8080"
              value={deviceUrl}
              onChange={e => setDeviceUrl(e.target.value)}
            />
            <p className="text-xs text-slate-500">AndroidAPS HTTP API 服务地址</p>
          </div>

          <div className="border-t border-slate-700 pt-4">
            <p className="text-xs text-slate-500 mb-3">Nightscout 配置（可选，用于查看数据）</p>
            <div className="space-y-3">
              <Input
                className="bg-slate-800 border-slate-700 text-white text-sm"
                placeholder="Nightscout URL（如 https://my.nightscout.site）"
                value={nightscoutUrl}
                onChange={e => setNightscoutUrl(e.target.value)}
              />
              <Input
                className="bg-slate-800 border-slate-700 text-white text-sm"
                type="password"
                placeholder="API Secret"
                value={apiSecret}
                onChange={e => setApiSecret(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg p-3">
              <XCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <Button
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 登录中...</> : '登录'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────── Status Panel ─────────────────────── */

function StatusPanel({ status, cgmEntries, onRefresh, refreshing }: {
  status: NightscoutStatus | null;
  cgmEntries: CGMEntry[];
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const latestCGM = cgmEntries[0];

  const cgmColor = (sgv: number) => {
    if (sgv >= 70 && sgv <= 180) return 'text-green-400';
    if (sgv > 180 && sgv <= 250) return 'text-amber-400';
    return 'text-red-400';
  };

  const cgmBg = (sgv: number) => {
    if (sgv >= 70 && sgv <= 180) return 'bg-green-500/10 ring-green-500/20';
    if (sgv > 180 && sgv <= 250) return 'bg-amber-500/10 ring-amber-500/20';
    return 'bg-red-500/10 ring-red-500/20';
  };

  const directionArrow = (dir: string) => {
    const map: Record<string, string> = {
      'Flat': '→', 'FortyFiveUp': '↗', 'SingleUp': '↑', 'DoubleUp': '⇈',
      'FortyFiveDown': '↘', 'SingleDown': '↓', 'DoubleDown': '⇊', 'NONE': '-',
    };
    return map[dir] || dir || '-';
  };

  return (
    <div className="space-y-4">
      {/* CGM Card */}
      <Card className="border-slate-700 bg-slate-900/60">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
            <Activity className="h-4 w-4" /> 当前血糖
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {latestCGM ? (
            <div className="flex items-end gap-4">
              <div className={`flex h-20 w-20 items-center justify-center rounded-2xl ring-1 ${cgmBg(latestCGM.sgv)}`}>
                <span className={`text-3xl font-bold ${cgmColor(latestCGM.sgv)}`}>{latestCGM.sgv}</span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-500 text-sm">mg/dL</span>
                <div className="text-2xl text-slate-300">{directionArrow(latestCGM.direction)}</div>
                <span className="text-xs text-slate-500">
                  {new Date(latestCGM.date).toLocaleTimeString('zh-CN')}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">暂无 CGM 数据</p>
          )}
          {/* Mini chart */}
          {cgmEntries.length > 1 && (
            <div className="mt-4 flex items-end gap-1 h-16">
              {cgmEntries.slice(0, 12).reverse().map((entry, i) => {
                const maxSGV = 400;
                const height = Math.max(4, (entry.sgv / maxSGV) * 100);
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${entry.sgv >= 70 && entry.sgv <= 180 ? 'bg-green-500/40' : entry.sgv <= 250 ? 'bg-amber-500/40' : 'bg-red-500/40'}`}
                    style={{ height: `${height}%` }}
                    title={`${entry.sgv} mg/dL`}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pump Status */}
      <Card className="border-slate-700 bg-slate-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
            <Droplets className="h-4 w-4" /> 泵状态
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-slate-500">储药器</span>
                <div className="flex items-center gap-2">
                  <Droplets className={`h-4 w-4 ${status.reservoir < 50 ? 'text-amber-400' : 'text-cyan-400'}`} />
                  <span className="text-lg font-bold text-white">{status.reservoir}U</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-500">电池</span>
                <div className="flex items-center gap-2">
                  <Battery className={`h-4 w-4 ${status.battery < 25 ? 'text-red-400' : 'text-green-400'}`} />
                  <span className="text-lg font-bold text-white">{status.battery}%</span>
                </div>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Badge variant={status.isBolusInProgress ? 'default' : 'secondary'}
                  className={status.isBolusInProgress ? 'bg-cyan-600' : 'bg-slate-700 text-slate-300'}>
                  {status.isBolusInProgress ? '输注中' : status.isSuspended ? '已暂停' : '正常'}
                </Badge>
                {status.pumpType && (
                  <span className="text-xs text-slate-500">{status.pumpType}</span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">无法获取泵状态</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────── Bolus / Carbs Form ─────────────────────── */

function TreatmentForm({ auth, config, safetyLock, onCommandSent }: {
  auth: AuthState;
  config: AppConfig;
  safetyLock: ReturnType<typeof useSafetyLock>;
  onCommandSent: (type: string, result: DirectAPICommandResult) => void;
}) {
  const [insulinDose, setInsulinDose] = useState('');
  const [carbsAmount, setCarbsAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'insulin' | 'carbs' | 'both';
    insulin?: number;
    carbs?: number;
  }>({ open: false, type: 'insulin' });
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<DirectAPICommandResult | null>(null);

  const insulinQuickDoses = [0.5, 1, 1.5, 2, 3, 5];
  const carbsQuickAmounts = [5, 10, 15, 20, 30, 45];

  const handleInsulinSubmit = () => {
    const dose = parseFloat(insulinDose);
    if (!dose || dose <= 0) { setError('请输入有效剂量'); return; }
    if (dose > SAFETY_RULES.MAX_BOLUS_UNITS) { setError(`最大单次剂量 ${SAFETY_RULES.MAX_BOLUS_UNITS}U`); return; }
    setError('');
    setConfirmDialog({ open: true, type: 'insulin', insulin: dose });
  };

  const handleCarbsSubmit = () => {
    const amount = parseInt(carbsAmount);
    if (!amount || amount <= 0) { setError('请输入有效碳水值'); return; }
    if (amount > SAFETY_RULES.MAX_CARBS_GRAMS) { setError(`最大单次碳水 ${SAFETY_RULES.MAX_CARBS_GRAMS}g`); return; }
    setError('');
    setConfirmDialog({ open: true, type: 'carbs', carbs: amount });
  };

  const handleConfirm = async () => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
    setLoading(true);
    setError('');
    setLastResult(null);

    try {
      if (confirmDialog.type === 'insulin' && confirmDialog.insulin) {
        const result = await apiBolus(config.deviceUrl, auth.token, confirmDialog.insulin, auth.phone);
        setLastResult(result);
        safetyLock.recordBolus();
        onCommandSent('insulin', result);
        setInsulinDose('');
      } else if (confirmDialog.type === 'carbs' && confirmDialog.carbs) {
        const result = await apiCarbs(config.deviceUrl, auth.token, confirmDialog.carbs, auth.phone);
        setLastResult(result);
        safetyLock.recordCarbs();
        onCommandSent('carbs', result);
        setCarbsAmount('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Safety Lock Banner */}
      {(safetyLock.isInsulinLocked || safetyLock.isCarbsLocked) && (
        <div className="flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
          <Lock className="h-5 w-5 text-amber-400 shrink-0" />
          <div className="text-sm">
            {safetyLock.isInsulinLocked && (
              <span className="text-amber-300">
                胰岛素锁定中，{formatCountdown(safetyLock.insulinCountdown)}后可再次输注
              </span>
            )}
            {safetyLock.isInsulinLocked && safetyLock.isCarbsLocked && <br />}
            {safetyLock.isCarbsLocked && (
              <span className="text-amber-300">
                碳水锁定中，{formatCountdown(safetyLock.carbsCountdown)}后可再次记录
              </span>
            )}
          </div>
        </div>
      )}

      {/* Insulin Card */}
      <Card className="border-slate-700 bg-slate-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-amber-400 flex items-center gap-2">
            <Droplets className="h-4 w-4" /> 胰岛素输注
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.1"
              min="0"
              max={SAFETY_RULES.MAX_BOLUS_UNITS}
              placeholder="剂量 (U)"
              value={insulinDose}
              onChange={e => setInsulinDose(e.target.value)}
              disabled={safetyLock.isInsulinLocked || loading}
              className="bg-slate-800 border-slate-700 text-white text-lg"
            />
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
              onClick={handleInsulinSubmit}
              disabled={safetyLock.isInsulinLocked || loading || !insulinDose}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {insulinQuickDoses.map(dose => (
              <Button
                key={dose}
                variant="outline"
                size="sm"
                className="border-slate-700 text-slate-300 hover:bg-amber-600/20 hover:text-amber-300"
                onClick={() => setInsulinDose(dose.toString())}
                disabled={safetyLock.isInsulinLocked || loading}
              >
                {dose}U
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Carbs Card */}
      <Card className="border-slate-700 bg-slate-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-green-400 flex items-center gap-2">
            <Activity className="h-4 w-4" /> 碳水记录
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              max={SAFETY_RULES.MAX_CARBS_GRAMS}
              placeholder="碳水 (g)"
              value={carbsAmount}
              onChange={e => setCarbsAmount(e.target.value)}
              disabled={safetyLock.isCarbsLocked || loading}
              className="bg-slate-800 border-slate-700 text-white text-lg"
            />
            <Button
              className="bg-green-600 hover:bg-green-700 text-white shrink-0"
              onClick={handleCarbsSubmit}
              disabled={safetyLock.isCarbsLocked || loading || !carbsAmount}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {carbsQuickAmounts.map(amount => (
              <Button
                key={amount}
                variant="outline"
                size="sm"
                className="border-slate-700 text-slate-300 hover:bg-green-600/20 hover:text-green-300"
                onClick={() => setCarbsAmount(amount.toString())}
                disabled={safetyLock.isCarbsLocked || loading}
              >
                {amount}g
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg p-3">
          <XCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Last Result */}
      {lastResult && (
        <Card className={`border-slate-700 ${lastResult.success ? 'bg-green-500/5' : 'bg-red-500/5'}`}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              {lastResult.success
                ? <CheckCircle2 className="h-5 w-5 text-green-400" />
                : <XCircle className="h-5 w-5 text-red-400" />}
              <span className={`font-medium ${lastResult.success ? 'text-green-300' : 'text-red-300'}`}>
                {lastResult.success ? '操作成功' : '操作失败'}
              </span>
            </div>
            <div className="text-sm text-slate-400 space-y-1">
              {lastResult.requestedAmount !== undefined && (
                <p>请求剂量: {lastResult.requestedAmount}U</p>
              )}
              {lastResult.deliveredAmount !== undefined && (
                <p>实际输注: <span className="text-white font-medium">{lastResult.deliveredAmount}U</span></p>
              )}
              {lastResult.message && <p>备注: {lastResult.message}</p>}
              <p>时间: {new Date(lastResult.createdAt).toLocaleString('zh-CN')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={open => setConfirmDialog(prev => ({ ...prev, open: open }))}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-white">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              确认操作
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {confirmDialog.type === 'insulin' && (
                <>即将通过短信发送 <span className="text-amber-300 font-bold">{confirmDialog.insulin}U</span> 胰岛素到 AndroidAPS 手机。<br />请确认剂量正确。</>
              )}
              {confirmDialog.type === 'carbs' && (
                <>即将记录 <span className="text-green-300 font-bold">{confirmDialog.carbs}g</span> 碳水。<br />请确认数值正确。</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300">取消</AlertDialogCancel>
            <AlertDialogAction
              className={confirmDialog.type === 'insulin' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}
              onClick={handleConfirm}
            >
              确认发送
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─────────────────────── Treatment History ─────────────────────── */

function TreatmentHistory({ treatments }: { treatments: TreatmentRecord[] }) {
  if (treatments.length === 0) {
    return <p className="text-slate-500 text-sm text-center py-8">暂无治疗记录</p>;
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {treatments.map(t => (
        <div key={t._id} className="flex items-center justify-between rounded-lg bg-slate-800/50 border border-slate-700/50 p-3">
          <div className="flex items-center gap-3">
            {t.insulin ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <Droplets className="h-4 w-4 text-amber-400" />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                <Activity className="h-4 w-4 text-green-400" />
              </div>
            )}
            <div>
              <p className="text-sm text-white">
                {t.insulin ? `${t.insulin}U 胰岛素` : ''}
                {t.insulin && t.carbs ? ' + ' : ''}
                {t.carbs ? `${t.carbs}g 碳水` : ''}
              </p>
              <p className="text-xs text-slate-500">
                {new Date(t.created_at).toLocaleString('zh-CN')}
              </p>
            </div>
          </div>
          {t.notes && <span className="text-xs text-slate-500">{t.notes}</span>}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── Settings Panel ─────────────────────── */

function SettingsPanel({ config, onSave, onDisconnect }: {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
  onDisconnect: () => void;
}) {
  const [nsUrl, setNsUrl] = useState(config.nightscoutUrl);
  const [secret, setSecret] = useState(config.apiSecret);
  const [deviceUrl, setDeviceUrl] = useState(config.deviceUrl);

  return (
    <Card className="border-slate-700 bg-slate-900/60">
      <CardHeader>
        <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
          <Settings className="h-4 w-4" /> 系统配置
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-slate-400 text-xs">Nightscout URL</Label>
          <Input className="bg-slate-800 border-slate-700 text-white text-sm" value={nsUrl} onChange={e => setNsUrl(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className="text-slate-400 text-xs">API Secret</Label>
          <Input className="bg-slate-800 border-slate-700 text-white text-sm" type="password" value={secret} onChange={e => setSecret(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className="text-slate-400 text-xs">设备地址</Label>
          <Input className="bg-slate-800 border-slate-700 text-white text-sm" value={deviceUrl} onChange={e => setDeviceUrl(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white text-sm"
            onClick={() => onSave({ ...config, nightscoutUrl: nsUrl, apiSecret: secret, deviceUrl })}>
            保存配置
          </Button>
          <Button variant="outline" className="border-red-700 text-red-400 hover:bg-red-500/10 text-sm"
            onClick={onDisconnect}>
            <LogOut className="h-4 w-4 mr-1" /> 退出
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────── Dashboard ─────────────────────── */

function Dashboard({ auth, config, onDisconnect }: {
  auth: AuthState;
  config: AppConfig;
  onDisconnect: () => void;
}) {
  const safetyLock = useSafetyLock();
  const [status, setStatus] = useState<NightscoutStatus | null>(null);
  const [cgmEntries, setCGMEntries] = useState<CGMEntry[]>([]);
  const [treatments, setTreatments] = useState<TreatmentRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentConfig, setCurrentConfig] = useState(config);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      // Fetch status from device
      const statusData = await apiStatus(currentConfig.deviceUrl, auth.token);
      setStatus(statusData);
    } catch { /* ignore */ }

    if (currentConfig.nightscoutUrl && currentConfig.apiSecret) {
      try {
        const [entries, treats] = await Promise.all([
          fetchNSEntries(currentConfig.nightscoutUrl, currentConfig.apiSecret),
          fetchNSTreatments(currentConfig.nightscoutUrl, currentConfig.apiSecret),
        ]);
        setCGMEntries(entries);
        setTreatments(treats);
      } catch { /* ignore */ }
    }
    setRefreshing(false);
  }, [currentConfig, auth.token]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 60000);
    return () => clearInterval(interval);
  }, [refreshData]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-cyan-400" />
            <span className="font-semibold text-white text-sm">AAPS Remote</span>
            <Badge variant="secondary" className="bg-slate-800 text-slate-400 text-xs ml-1">
              {auth.phone}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => setShowSettings(!showSettings)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={refreshData} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4 space-y-4">
        {/* Settings Panel (collapsible) */}
        {showSettings && (
          <SettingsPanel
            config={currentConfig}
            onSave={(newConfig) => { setCurrentConfig(newConfig); setShowSettings(false); }}
            onDisconnect={onDisconnect}
          />
        )}

        {/* Safety Lock Banner */}
        {(safetyLock.isInsulinLocked || safetyLock.isCarbsLocked) && (
          <div className="flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
            <Lock className="h-5 w-5 text-amber-400 shrink-0" />
            <div className="text-sm text-amber-300">
              {safetyLock.isInsulinLocked && <>胰岛素锁定 {formatCountdown(safetyLock.insulinCountdown)} &nbsp;</>}
              {safetyLock.isCarbsLocked && <>碳水锁定 {formatCountdown(safetyLock.carbsCountdown)}</>}
            </div>
          </div>
        )}

        <Tabs defaultValue="control" className="space-y-4">
          <TabsList className="w-full bg-slate-800/50 border border-slate-700">
            <TabsTrigger value="control" className="flex-1 text-sm">
              <Send className="h-3.5 w-3.5 mr-1.5" /> 输注控制
            </TabsTrigger>
            <TabsTrigger value="status" className="flex-1 text-sm">
              <Activity className="h-3.5 w-3.5 mr-1.5" /> 状态数据
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 text-sm">
              <Clock className="h-3.5 w-3.5 mr-1.5" /> 治疗记录
            </TabsTrigger>
          </TabsList>

          <TabsContent value="control">
            <TreatmentForm
              auth={auth}
              config={currentConfig}
              safetyLock={safetyLock}
              onCommandSent={() => refreshData()}
            />
          </TabsContent>

          <TabsContent value="status">
            <StatusPanel
              status={status}
              cgmEntries={cgmEntries}
              onRefresh={refreshData}
              refreshing={refreshing}
            />
          </TabsContent>

          <TabsContent value="history">
            <Card className="border-slate-700 bg-slate-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> 最近治疗记录
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TreatmentHistory treatments={treatments} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

/* ─────────────────────── Home ─────────────────────── */

export default function Home() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const handleLogin = (authState: AuthState, appConfig: AppConfig) => {
    setAuth(authState);
    setConfig(appConfig);
  };

  const handleDisconnect = () => {
    setAuth(null);
    setConfig(null);
  };

  if (!auth || !config) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <Dashboard auth={auth} config={config} onDisconnect={handleDisconnect} />;
}
