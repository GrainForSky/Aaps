'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Activity,
  Droplets,
  Battery,
  Send,
  Settings,
  LogOut,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Phone,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import type {
  UserSession,
  AppConfig,
  SMSGatewayConfig,
  NightscoutConfig,
  TreatmentRecord,
  CGMEntry,
  DeviceStatus,
  SafetyLock,
} from '@/lib/types';
import { SAFETY_RULES, SMS_PROVIDER_PRESETS } from '@/lib/types';
import { useSafetyLock } from '@/hooks/use-safety-lock';
import { useSMSCommand } from '@/hooks/use-sms-command';

// ============================================================
// Login Screen
// ============================================================
function LoginScreen({ onLogin }: { onLogin: (phone: string) => void }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = phone.replace(/[\s\-()]/g, '');
    if (!/^1[3-9]\d{9}$/.test(cleaned)) {
      setError('请输入有效的手机号码');
      return;
    }
    onLogin(cleaned);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <Card className="w-full max-w-md border-slate-700 bg-slate-900/80">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <Phone className="w-8 h-8 text-cyan-400" />
          </div>
          <CardTitle className="text-2xl text-white">AndroidAPS 远程控制</CardTitle>
          <CardDescription className="text-slate-400">
            输入手机号码登录，该号码将作为 AndroidAPS SMS 白名单
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-slate-300">手机号码</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="请输入手机号码"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(''); }}
                className="bg-slate-800 border-slate-600 text-white text-lg"
                maxLength={13}
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
            <Button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-700 text-white" size="lg">
              登录
            </Button>
          </form>
          <div className="mt-6 p-3 rounded-md bg-slate-800/50 border border-slate-700">
            <p className="text-xs text-slate-400">
              <AlertTriangle className="w-3 h-3 inline mr-1 text-amber-400" />
              登录手机号需要在 AndroidAPS SMS Communicator 中添加到白名单，否则命令将被拒绝。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Setup Screen - Configure SMS Gateway & Nightscout
// ============================================================
function SetupScreen({
  phoneNumber,
  initialConfig,
  onSave,
  onSkip,
}: {
  phoneNumber: string;
  initialConfig: AppConfig | null;
  onSave: (config: AppConfig) => void;
  onSkip: () => void;
}) {
  const [provider, setProvider] = useState<SMSGatewayConfig['provider']>(
    initialConfig?.sms.provider || 'generic'
  );
  const [apiUrl, setApiUrl] = useState(initialConfig?.sms.apiUrl || '');
  const [apiKey, setApiKey] = useState(initialConfig?.sms.apiKey || '');
  const [apiSecret, setApiSecret] = useState(initialConfig?.sms.apiSecret || '');
  const [fromNumber, setFromNumber] = useState(initialConfig?.sms.fromNumber || '');
  const [signName, setSignName] = useState(initialConfig?.sms.signName || '');
  const [templateCode, setTemplateCode] = useState(initialConfig?.sms.templateCode || '');

  const [nsUrl, setNsUrl] = useState(initialConfig?.nightscout.url || '');
  const [nsSecret, setNsSecret] = useState(initialConfig?.nightscout.apiSecret || '');

  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleProviderChange = (value: string) => {
    const p = value as SMSGatewayConfig['provider'];
    setProvider(p);
    const preset = SMS_PROVIDER_PRESETS.find((x) => x.provider === p);
    if (preset) {
      setApiUrl(preset.placeholder.apiUrl);
      setApiKey(preset.placeholder.apiKey);
      setApiSecret(preset.placeholder.apiSecret || '');
      setSignName(preset.placeholder.signName || '');
      setTemplateCode(preset.placeholder.templateCode || '');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/nightscout/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nightscoutUrl: nsUrl, apiSecret: nsSecret }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ ok: true, msg: 'Nightscout 连接成功' });
      } else {
        setTestResult({ ok: false, msg: data.error || '连接失败' });
      }
    } catch {
      setTestResult({ ok: false, msg: '网络错误' });
    }
    setTesting(false);
  };

  const handleSave = () => {
    const config: AppConfig = {
      sms: {
        provider,
        apiUrl,
        apiKey,
        apiSecret: apiSecret || undefined,
        fromNumber,
        toNumber: phoneNumber,
        signName: signName || undefined,
        templateCode: templateCode || undefined,
      },
      nightscout: {
        url: nsUrl,
        apiSecret: nsSecret,
      },
    };
    onSave(config);
  };

  const preset = SMS_PROVIDER_PRESETS.find((x) => x.provider === provider);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">系统配置</h1>
          <p className="text-slate-400 mt-1">
            登录号码：<span className="text-cyan-400">{phoneNumber}</span>（将作为 AndroidAPS 白名单）
          </p>
        </div>

        {/* SMS Gateway Config */}
        <Card className="border-slate-700 bg-slate-900/80">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Send className="w-5 h-5 text-cyan-400" />
              SMS 网关配置
            </CardTitle>
            <CardDescription className="text-slate-400">
              配置短信网关，用于向 AndroidAPS 手机发送输注命令
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">短信服务商</Label>
              <Select value={provider} onValueChange={handleProviderChange}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SMS_PROVIDER_PRESETS.map((p) => (
                    <SelectItem key={p.provider} value={p.provider}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {preset?.helpText && (
                <p className="text-xs text-slate-500 mt-1">{preset.helpText}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">API 地址</Label>
                <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)}
                  placeholder={preset?.placeholder.apiUrl}
                  className="bg-slate-800 border-slate-600 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">API Key / ID</Label>
                <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  placeholder={preset?.placeholder.apiKey}
                  className="bg-slate-800 border-slate-600 text-white" />
              </div>
            </div>

            {(provider === 'aliyun' || provider === 'tencent' || provider === 'twilio') && (
              <div className="space-y-2">
                <Label className="text-slate-300">API Secret / Token</Label>
                <Input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)}
                  type="password" placeholder={preset?.placeholder.apiSecret}
                  className="bg-slate-800 border-slate-600 text-white" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">发送方号码</Label>
                <Input value={fromNumber} onChange={(e) => setFromNumber(e.target.value)}
                  placeholder="网关分配的号码"
                  className="bg-slate-800 border-slate-600 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">接收方号码</Label>
                <Input value={phoneNumber} disabled
                  className="bg-slate-800/50 border-slate-600 text-slate-400" />
                <p className="text-xs text-slate-500">自动使用登录手机号</p>
              </div>
            </div>

            {(provider === 'aliyun' || provider === 'tencent') && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">短信签名</Label>
                  <Input value={signName} onChange={(e) => setSignName(e.target.value)}
                    placeholder={preset?.placeholder.signName}
                    className="bg-slate-800 border-slate-600 text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">模板 ID</Label>
                  <Input value={templateCode} onChange={(e) => setTemplateCode(e.target.value)}
                    placeholder={preset?.placeholder.templateCode}
                    className="bg-slate-800 border-slate-600 text-white" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nightscout Config */}
        <Card className="border-slate-700 bg-slate-900/80">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-400" />
              Nightscout 配置
            </CardTitle>
            <CardDescription className="text-slate-400">
              用于读取血糖、泵状态和治疗记录数据
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Nightscout URL</Label>
                <Input value={nsUrl} onChange={(e) => setNsUrl(e.target.value)}
                  placeholder="https://your-nightscout.herokuapp.com"
                  className="bg-slate-800 border-slate-600 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">API Secret</Label>
                <Input value={nsSecret} onChange={(e) => setNsSecret(e.target.value)}
                  type="password" placeholder="API Secret"
                  className="bg-slate-800 border-slate-600 text-white" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleTest} variant="outline" disabled={testing || !nsUrl}
                className="border-slate-600 text-slate-300">
                {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                测试连接
              </Button>
              {testResult && (
                <span className={`text-sm ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                  {testResult.ok ? <CheckCircle2 className="w-4 h-4 inline mr-1" /> : <XCircle className="w-4 h-4 inline mr-1" />}
                  {testResult.msg}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSave} className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white" size="lg">
            保存配置
          </Button>
          <Button onClick={onSkip} variant="outline" className="border-slate-600 text-slate-300" size="lg">
            稍后配置
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Status Panel
// ============================================================
function StatusPanel({ status, cgm, onRefresh, refreshing }: {
  status: DeviceStatus | null;
  cgm: CGMEntry | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const getSGVColor = (sgv: number) => {
    if (sgv >= 70 && sgv <= 180) return 'text-green-400';
    if (sgv > 180 && sgv <= 250) return 'text-amber-400';
    return 'text-red-400';
  };

  const getDirection = (dir: string) => {
    const map: Record<string, string> = {
      Flat: '→', FortyFiveUp: '↗', FortyFiveDown: '↘',
      SingleUp: '↑', SingleDown: '↓', DoubleUp: '⇈', DoubleDown: '⇊',
    };
    return map[dir] || dir;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card className="border-slate-700 bg-slate-900/80">
        <CardContent className="pt-4 text-center">
          <p className="text-xs text-slate-400 mb-1">当前血糖</p>
          {cgm ? (
            <>
              <p className={`text-3xl font-bold ${getSGVColor(cgm.sgv)}`}>{cgm.sgv}</p>
              <p className={`text-lg ${getSGVColor(cgm.sgv)}`}>{getDirection(cgm.direction)}</p>
            </>
          ) : (
            <p className="text-2xl text-slate-500">--</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-900/80">
        <CardContent className="pt-4 text-center">
          <p className="text-xs text-slate-400 mb-1">储药器</p>
          {status?.pump?.reservoir != null ? (
            <p className={`text-3xl font-bold ${status.pump.reservoir < 20 ? 'text-red-400' : 'text-cyan-400'}`}>
              {status.pump.reservoir}<span className="text-sm ml-1">U</span>
            </p>
          ) : (
            <p className="text-2xl text-slate-500">--</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-900/80">
        <CardContent className="pt-4 text-center">
          <p className="text-xs text-slate-400 mb-1">活性胰岛素</p>
          {status?.openaps?.iob?.iob != null ? (
            <p className="text-3xl font-bold text-amber-400">
              {status.openaps.iob.iob.toFixed(1)}<span className="text-sm ml-1">U</span>
            </p>
          ) : (
            <p className="text-2xl text-slate-500">--</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-900/80">
        <CardContent className="pt-4 text-center">
          <p className="text-xs text-slate-400 mb-1">泵电池</p>
          {status?.pump?.battery?.percent != null ? (
            <>
              <Battery className={`w-8 h-8 mx-auto mb-1 ${status.pump.battery.percent < 25 ? 'text-red-400' : 'text-green-400'}`} />
              <p className={`text-xl font-bold ${status.pump.battery.percent < 25 ? 'text-red-400' : 'text-green-400'}`}>
                {status.pump.battery.percent}%
              </p>
            </>
          ) : (
            <p className="text-2xl text-slate-500">--</p>
          )}
        </CardContent>
      </Card>

      <div className="col-span-2 md:col-span-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing}
          className="text-slate-400">
          <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          刷新数据
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Bolus / Carbs Input
// ============================================================
function BolusCarbsPanel({
  safetyLock,
  onBolus,
  onCarbs,
  onMixed,
  isSending,
  lastResult,
}: {
  safetyLock: ReturnType<typeof useSafetyLock>;
  onBolus: (amount: number) => void;
  onCarbs: (amount: number) => void;
  onMixed: (insulin: number, carbs: number) => void;
  isSending: boolean;
  lastResult: { success: boolean; error?: string } | null;
}) {
  const [insulin, setInsulin] = useState('');
  const [carbs, setCarbs] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: string; i: number; c: number } | null>(null);

  const insulinNum = parseFloat(insulin) || 0;
  const carbsNum = parseFloat(carbs) || 0;

  const handleAction = (type: string, i: number, c: number) => {
    if ((i > 0 && safetyLock.isInsulinLocked) || (c > 0 && safetyLock.isCarbsLocked)) return;
    setPendingAction({ type, i, c });
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'bolus') onBolus(pendingAction.i);
    else if (pendingAction.type === 'carbs') onCarbs(pendingAction.c);
    else if (pendingAction.type === 'mixed') onMixed(pendingAction.i, pendingAction.c);
    setConfirmOpen(false);
    setPendingAction(null);
    setInsulin('');
    setCarbs('');
  };

  const bolusQuick = [0.5, 1, 1.5, 2, 3, 5];
  const carbsQuick = [5, 10, 15, 20, 30, 45];

  return (
    <>
      <div className="grid md:grid-cols-2 gap-4">
        {/* Insulin */}
        <Card className="border-slate-700 bg-slate-900/80">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <Droplets className="w-5 h-5 text-amber-400" />
              胰岛素输注
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {safetyLock.isInsulinLocked && (
              <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/30">
                <Lock className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-400">
                  锁定中 {Math.ceil(safetyLock.insulinCountdown / 60)}:{String(safetyLock.insulinCountdown % 60).padStart(2, '0')}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <Input type="number" placeholder="剂量 (U)" value={insulin}
                onChange={(e) => setInsulin(e.target.value)} step="0.1" min="0" max={SAFETY_RULES.MAX_BOLUS_UNITS}
                disabled={safetyLock.isInsulinLocked}
                className="bg-slate-800 border-slate-600 text-white text-lg" />
              <Button onClick={() => handleAction('bolus', insulinNum, 0)}
                disabled={!insulinNum || safetyLock.isInsulinLocked || isSending}
                className="bg-amber-600 hover:bg-amber-700 text-white">
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {bolusQuick.map((d) => (
                <Button key={d} variant="outline" size="sm"
                  onClick={() => handleAction('bolus', d, 0)}
                  disabled={safetyLock.isInsulinLocked || isSending}
                  className="border-slate-600 text-slate-300 hover:bg-amber-600/20">
                  {d}U
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Carbs */}
        <Card className="border-slate-700 bg-slate-900/80">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <span className="text-lg">🍞</span>
              碳水记录
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {safetyLock.isCarbsLocked && (
              <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/30">
                <Lock className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-400">
                  锁定中 {safetyLock.carbsCountdown}s
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <Input type="number" placeholder="碳水 (g)" value={carbs}
                onChange={(e) => setCarbs(e.target.value)} min="0" max={SAFETY_RULES.MAX_CARBS_GRAMS}
                disabled={safetyLock.isCarbsLocked}
                className="bg-slate-800 border-slate-600 text-white text-lg" />
              <Button onClick={() => handleAction('carbs', 0, carbsNum)}
                disabled={!carbsNum || safetyLock.isCarbsLocked || isSending}
                className="bg-green-600 hover:bg-green-700 text-white">
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {carbsQuick.map((g) => (
                <Button key={g} variant="outline" size="sm"
                  onClick={() => handleAction('carbs', 0, g)}
                  disabled={safetyLock.isCarbsLocked || isSending}
                  className="border-slate-600 text-slate-300 hover:bg-green-600/20">
                  {g}g
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mixed bolus + carbs */}
      {(insulinNum > 0 && carbsNum > 0) && (
        <Button onClick={() => handleAction('mixed', insulinNum, carbsNum)}
          disabled={safetyLock.isInsulinLocked || safetyLock.isCarbsLocked || isSending}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white">
          混合输注：{insulinNum}U 胰岛素 + {carbsNum}g 碳水
        </Button>
      )}

      {/* SMS Result */}
      {lastResult && (
        <div className={`p-3 rounded-md border ${lastResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <p className={`text-sm ${lastResult.success ? 'text-green-400' : 'text-red-400'}`}>
            {lastResult.success ? '✓ 短信已发送，请等待 AndroidAPS 执行' : `✗ ${lastResult.error}`}
          </p>
        </div>
      )}

      {/* Confirm Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              确认操作
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {pendingAction?.type === 'bolus' && `将通过短信发送 BOLUS ${pendingAction.i}U 到 AndroidAPS`}
              {pendingAction?.type === 'carbs' && `将通过短信发送 CARBS ${pendingAction.c}g 到 AndroidAPS`}
              {pendingAction?.type === 'mixed' && `将通过短信发送 BOLUS ${pendingAction.i}U + CARBS ${pendingAction.c}g 到 AndroidAPS`}
              <br /><br />
              <span className="text-amber-400">请确认操作正确！短信发送后无法撤回。</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300">取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-cyan-600 hover:bg-cyan-700 text-white">
              确认发送
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================================
// Treatment History
// ============================================================
function TreatmentHistory({ treatments }: { treatments: TreatmentRecord[] }) {
  if (!treatments.length) {
    return (
      <Card className="border-slate-700 bg-slate-900/80">
        <CardContent className="pt-6 text-center text-slate-500">暂无治疗记录</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-700 bg-slate-900/80">
      <CardHeader>
        <CardTitle className="text-white">治疗记录</CardTitle>
        <CardDescription className="text-slate-400">最近 20 条记录（来自 Nightscout）</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {treatments.map((t) => (
            <div key={t._id} className="flex items-center justify-between p-3 rounded-md bg-slate-800/50 border border-slate-700">
              <div>
                <div className="flex items-center gap-2">
                  {t.insulin ? <Badge variant="default" className="bg-amber-600">{t.insulin}U</Badge> : null}
                  {t.carbs ? <Badge variant="default" className="bg-green-600">{t.carbs}g</Badge> : null}
                  <span className="text-xs text-slate-500">{t.eventType}</span>
                </div>
                {t.notes && <p className="text-xs text-slate-400 mt-1">{t.notes}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">
                  {new Date(t.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-xs text-slate-500">{t.enteredBy}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Dashboard
// ============================================================
function Dashboard({
  session,
  config,
  onLogout,
  onOpenSettings,
}: {
  session: UserSession;
  config: AppConfig | null;
  onLogout: () => void;
  onOpenSettings: () => void;
}) {
  const [treatments, setTreatments] = useState<TreatmentRecord[]>([]);
  const [cgmEntries, setCGMEntries] = useState<CGMEntry[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('control');

  const safetyLock = useSafetyLock();
  const smsCmd = useSMSCommand(config?.sms || null);

  const nsUrl = config?.nightscout.url || '';
  const nsSecret = config?.nightscout.apiSecret || '';

  const fetchData = useCallback(async () => {
    if (!nsUrl || !nsSecret) return;
    setLoading(true);
    try {
      const [tRes, sRes, cRes] = await Promise.all([
        fetch(`/api/nightscout/treatments?url=${encodeURIComponent(nsUrl)}&secret=${encodeURIComponent(nsSecret)}&count=20`),
        fetch(`/api/nightscout/status?url=${encodeURIComponent(nsUrl)}&secret=${encodeURIComponent(nsSecret)}`),
        fetch(`/api/nightscout/entries?url=${encodeURIComponent(nsUrl)}&secret=${encodeURIComponent(nsSecret)}`),
      ]);
      const tData = await tRes.json();
      const sData = await sRes.json();
      const cData = await cRes.json();
      if (tData.success) setTreatments(tData.data);
      if (sData.success) setDeviceStatus(sData.data);
      if (cData.success) setCGMEntries(cData.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
    setLoading(false);
  }, [nsUrl, nsSecret]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleBolus = async (amount: number) => {
    const result = await smsCmd.sendCommand('bolus', { insulin: amount });
    if (result.success) safetyLock.recordBolus();
  };

  const handleCarbs = async (amount: number) => {
    const result = await smsCmd.sendCommand('carbs', { carbs: amount });
    if (result.success) safetyLock.recordCarbs();
  };

  const handleMixed = async (insulin: number, carbs: number) => {
    // Send two separate SMS commands
    const r1 = await smsCmd.sendCommand('bolus', { insulin });
    if (r1.success) {
      safetyLock.recordBolus();
      await smsCmd.sendCommand('carbs', { carbs });
      safetyLock.recordCarbs();
    }
  };

  const latestCGM = cgmEntries.length > 0 ? cgmEntries[0] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">AndroidAPS 远程控制</h1>
            <p className="text-sm text-slate-400">
              <Phone className="w-3 h-3 inline mr-1" />
              {session.phoneNumber}
              <span className="ml-2 text-xs text-slate-500">
                SMS 命令 → AndroidAPS
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onOpenSettings} className="text-slate-400">
              <Settings className="w-4 h-4 mr-1" /> 配置
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout} className="text-slate-400">
              <LogOut className="w-4 h-4 mr-1" /> 退出
            </Button>
          </div>
        </div>

        {/* Safety Lock Banner */}
        {(safetyLock.isInsulinLocked || safetyLock.isCarbsLocked) && (
          <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-amber-400">
              {safetyLock.isInsulinLocked && `胰岛素锁定 ${Math.ceil(safetyLock.insulinCountdown / 60)}:${String(safetyLock.insulinCountdown % 60).padStart(2, '0')} `}
              {safetyLock.isCarbsLocked && `碳水锁定 ${safetyLock.carbsCountdown}s`}
            </span>
          </div>
        )}

        {/* Status Panel */}
        <StatusPanel status={deviceStatus} cgm={latestCGM} onRefresh={fetchData} refreshing={loading} />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800 border border-slate-700">
            <TabsTrigger value="control" className="text-slate-300">输注控制</TabsTrigger>
            <TabsTrigger value="history" className="text-slate-300">治疗记录</TabsTrigger>
          </TabsList>

          <TabsContent value="control" className="mt-4">
            <BolusCarbsPanel
              safetyLock={safetyLock}
              onBolus={handleBolus}
              onCarbs={handleCarbs}
              onMixed={handleMixed}
              isSending={smsCmd.isSending}
              lastResult={smsCmd.lastResult}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <TreatmentHistory treatments={treatments} />
          </TabsContent>
        </Tabs>

        {!config && (
          <div className="p-4 rounded-md bg-amber-500/10 border border-amber-500/30 text-center">
            <p className="text-amber-400 text-sm">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              请先完成 SMS 网关和 Nightscout 配置
              <Button variant="link" className="text-amber-400 underline ml-1" onClick={onOpenSettings}>
                前往配置
              </Button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Home
// ============================================================
export default function Home() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    const savedSession = localStorage.getItem('aaps_session');
    const savedConfig = localStorage.getItem('aaps_config');
    if (savedSession) {
      setSession(JSON.parse(savedSession));
    }
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig));
    }
  }, []);

  const handleLogin = (phone: string) => {
    const s: UserSession = { phoneNumber: phone, loggedInAt: Date.now() };
    setSession(s);
    localStorage.setItem('aaps_session', JSON.stringify(s));
    // Check if config exists for this phone
    const savedConfig = localStorage.getItem('aaps_config');
    if (!savedConfig) {
      setShowSetup(true);
    }
  };

  const handleLogout = () => {
    setSession(null);
    setConfig(null);
    setShowSetup(false);
    localStorage.removeItem('aaps_session');
    localStorage.removeItem('aaps_config');
  };

  const handleSaveConfig = (c: AppConfig) => {
    setConfig(c);
    localStorage.setItem('aaps_config', JSON.stringify(c));
    setShowSetup(false);
  };

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (showSetup || !config) {
    return (
      <SetupScreen
        phoneNumber={session.phoneNumber}
        initialConfig={config}
        onSave={handleSaveConfig}
        onSkip={() => setShowSetup(false)}
      />
    );
  }

  return (
    <Dashboard
      session={session}
      config={config}
      onLogout={handleLogout}
      onOpenSettings={() => setShowSetup(true)}
    />
  );
}
