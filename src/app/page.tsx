'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNightscout } from '@/hooks/use-nightscout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  Droplets,
  Syringe,
  Wheat,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Battery,
  Zap,
  ShieldAlert,
  Link2,
  Unlink,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Direction arrow helper                                             */
/* ------------------------------------------------------------------ */
function directionArrow(dir: string): string {
  const map: Record<string, string> = {
    Flat: '→',
    FortyFiveUp: '↗',
    FortyFiveDown: '↘',
    SingleUp: '↑',
    SingleDown: '↓',
    DoubleUp: '⇈',
    DoubleDown: '⇊',
    NONE: '—',
  };
  return map[dir] || '—';
}

function bgColor(sgv: number): string {
  if (sgv >= 70 && sgv <= 180) return 'text-green-400';
  if (sgv > 180 && sgv <= 250) return 'text-amber-400';
  if (sgv > 250) return 'text-red-400';
  if (sgv < 54) return 'text-red-500';
  return 'text-amber-400';
}

/* ------------------------------------------------------------------ */
/*  Connection Screen                                                  */
/* ------------------------------------------------------------------ */
function ConnectionScreen({
  onConnect,
  isLoading,
  error,
}: {
  onConnect: (url: string, secret: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}) {
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConnect(url.trim(), secret.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <Card className="w-full max-w-md border-slate-700/50 bg-slate-900/80 backdrop-blur shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-2">
            <Activity className="w-8 h-8 text-cyan-400" />
          </div>
          <CardTitle className="text-2xl text-white">AndroidAPS Remote</CardTitle>
          <CardDescription className="text-slate-400">
            连接到您的 Nightscout 实例以远程控制胰岛素泵
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url" className="text-slate-300">
                Nightscout URL
              </Label>
              <Input
                id="url"
                placeholder="https://your-nightscout.herokuapp.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secret" className="text-slate-300">
                API Secret
              </Label>
              <Input
                id="secret"
                type="password"
                placeholder="Your Nightscout API secret"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-sm text-red-400">{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 mr-2" />
              )}
              {isLoading ? '连接中...' : '连接'}
            </Button>
          </form>

          <div className="mt-6 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-300/80 space-y-1">
                <p className="font-medium text-amber-300">安全提示</p>
                <p>
                  本工具仅用于辅助管理，所有操作请在医疗专业人员指导下进行。请确保 Nightscout
                  地址和 API Secret 正确无误。
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status Dashboard                                                   */
/* ------------------------------------------------------------------ */
function StatusDashboard({
  cgmEntries,
  deviceStatus,
  onRefresh,
  isRefreshing,
}: {
  cgmEntries: { sgv: number; direction: string; dateString: string }[];
  deviceStatus: {
    pump?: {
      reservoir?: number;
      battery?: { percent?: number };
      status?: { status?: string; bolusing?: boolean; suspended?: boolean };
    };
    openaps?: {
      iob?: { iob?: number };
      suggested?: { reason?: string };
    };
  } | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const latestBG = cgmEntries[0];
  const pump = deviceStatus?.pump;
  const openaps = deviceStatus?.openaps;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* CGM */}
      <Card className="border-slate-700/50 bg-slate-900/60">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">当前血糖</span>
            <Droplets className="w-4 h-4 text-cyan-400" />
          </div>
          {latestBG ? (
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${bgColor(latestBG.sgv)}`}>
                {latestBG.sgv}
              </span>
              <span className="text-sm text-slate-400">mg/dL</span>
              <span className="text-xl text-slate-300">{directionArrow(latestBG.direction)}</span>
            </div>
          ) : (
            <span className="text-slate-500 text-lg">--</span>
          )}
          {latestBG && (
            <p className="text-xs text-slate-500 mt-1">
              {new Date(latestBG.dateString).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Pump Reservoir */}
      <Card className="border-slate-700/50 bg-slate-900/60">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">储药器</span>
            <Syringe className="w-4 h-4 text-amber-400" />
          </div>
          {pump?.reservoir != null ? (
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-amber-400">{pump.reservoir}</span>
              <span className="text-sm text-slate-400">U</span>
            </div>
          ) : (
            <span className="text-slate-500 text-lg">--</span>
          )}
          {pump?.battery?.percent != null && (
            <div className="flex items-center gap-1 mt-1">
              <Battery
                className={`w-3 h-3 ${pump.battery.percent > 25 ? 'text-green-400' : 'text-red-400'}`}
              />
              <span className="text-xs text-slate-500">{pump.battery.percent}%</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* IOB */}
      <Card className="border-slate-700/50 bg-slate-900/60">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">活性胰岛素</span>
            <Zap className="w-4 h-4 text-purple-400" />
          </div>
          {openaps?.iob?.iob != null ? (
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-purple-400">
                {openaps.iob.iob.toFixed(2)}
              </span>
              <span className="text-sm text-slate-400">U</span>
            </div>
          ) : (
            <span className="text-slate-500 text-lg">--</span>
          )}
          {pump?.status?.status && (
            <Badge
              variant="outline"
              className={`text-xs mt-1 ${
                pump.status.suspended
                  ? 'border-red-500/50 text-red-400'
                  : pump.status.bolusing
                    ? 'border-amber-500/50 text-amber-400'
                    : 'border-green-500/50 text-green-400'
              }`}
            >
              {pump.status.suspended ? '已暂停' : pump.status.bolusing ? '输注中' : '正常'}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Refresh */}
      <Card className="border-slate-700/50 bg-slate-900/60">
        <CardContent className="p-4 flex flex-col items-center justify-center h-full">
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
          >
            <RefreshCw className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <span className="text-xs text-slate-500 mt-2">刷新数据</span>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Treatment Form                                                     */
/* ------------------------------------------------------------------ */
function TreatmentForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (type: 'insulin' | 'carbs' | 'both', insulin: number, carbs: number, notes: string) => void;
  isLoading: boolean;
}) {
  const [mode, setMode] = useState<'insulin' | 'carbs' | 'both'>('insulin');
  const [insulin, setInsulin] = useState('');
  const [carbs, setCarbs] = useState('');
  const [notes, setNotes] = useState('');

  const quickInsulin = [0.5, 1.0, 1.5, 2.0, 3.0, 5.0];
  const quickCarbs = [5, 10, 15, 20, 30, 45];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const i = mode === 'carbs' ? 0 : parseFloat(insulin);
    const c = mode === 'insulin' ? 0 : parseFloat(carbs);
    if ((mode === 'insulin' || mode === 'both') && (isNaN(i) || i <= 0)) return;
    if ((mode === 'carbs' || mode === 'both') && (isNaN(c) || c <= 0)) return;
    onSubmit(mode, i, c, notes);
  };

  return (
    <Card className="border-slate-700/50 bg-slate-900/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-cyan-400" />
          输注操作
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Mode tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { key: 'insulin' as const, label: '胰岛素', icon: Syringe, color: 'text-amber-400' },
            { key: 'carbs' as const, label: '碳水化合物', icon: Wheat, color: 'text-green-400' },
            { key: 'both' as const, label: '混合输注', icon: Zap, color: 'text-purple-400' },
          ].map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                mode === key
                  ? 'bg-slate-700/80 ring-1 ring-cyan-500/50 text-white'
                  : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-300'
              }`}
            >
              <Icon className={`w-4 h-4 ${mode === key ? color : ''}`} />
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Insulin input */}
          {(mode === 'insulin' || mode === 'both') && (
            <div className="space-y-3">
              <Label className="text-slate-300 flex items-center gap-2">
                <Syringe className="w-4 h-4 text-amber-400" />
                胰岛素剂量 (U)
              </Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="30"
                placeholder="0.0"
                value={insulin}
                onChange={(e) => setInsulin(e.target.value)}
                className="bg-slate-800/50 border-slate-700 text-white text-2xl font-bold text-center h-14 placeholder:text-slate-600"
                required={mode === 'insulin'}
              />
              <div className="flex gap-2 flex-wrap">
                {quickInsulin.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setInsulin(d.toString())}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors border border-amber-500/20"
                  >
                    {d}U
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Carbs input */}
          {(mode === 'carbs' || mode === 'both') && (
            <div className="space-y-3">
              <Label className="text-slate-300 flex items-center gap-2">
                <Wheat className="w-4 h-4 text-green-400" />
                碳水化合物 (g)
              </Label>
              <Input
                type="number"
                step="1"
                min="0"
                max="200"
                placeholder="0"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                className="bg-slate-800/50 border-slate-700 text-white text-2xl font-bold text-center h-14 placeholder:text-slate-600"
                required={mode === 'carbs'}
              />
              <div className="flex gap-2 flex-wrap">
                {quickCarbs.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCarbs(c.toString())}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors border border-green-500/20"
                  >
                    {c}g
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-slate-300">备注 (可选)</Label>
            <Input
              placeholder="添加备注信息..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          <Button
            type="submit"
            className={`w-full font-medium text-white h-12 text-base ${
              mode === 'carbs'
                ? 'bg-green-600 hover:bg-green-700'
                : mode === 'both'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-amber-600 hover:bg-amber-700'
            }`}
            disabled={isLoading}
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            提交输注
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Treatment History                                                  */
/* ------------------------------------------------------------------ */
function TreatmentHistory({
  treatments,
}: {
  treatments: {
    _id: string;
    created_at: string;
    eventType: string;
    insulin?: number;
    carbs?: number;
    notes?: string;
    enteredBy?: string;
  }[];
}) {
  if (treatments.length === 0) {
    return (
      <Card className="border-slate-700/50 bg-slate-900/60">
        <CardContent className="p-8 text-center">
          <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">暂无治疗记录</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-700/50 bg-slate-900/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-400" />
          最近记录
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2">
            {treatments.map((t) => (
              <div
                key={t._id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/30"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      t.insulin && t.carbs
                        ? 'bg-purple-500/10'
                        : t.insulin
                          ? 'bg-amber-500/10'
                          : 'bg-green-500/10'
                    }`}
                  >
                    {t.insulin && t.carbs ? (
                      <Zap className="w-4 h-4 text-purple-400" />
                    ) : t.insulin ? (
                      <Syringe className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Wheat className="w-4 h-4 text-green-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{t.eventType}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(t.created_at).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {t.enteredBy && ` · ${t.enteredBy}`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {t.insulin != null && t.insulin > 0 && (
                    <p className="text-sm font-medium text-amber-400">{t.insulin}U</p>
                  )}
                  {t.carbs != null && t.carbs > 0 && (
                    <p className="text-sm font-medium text-green-400">{t.carbs}g</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard                                                     */
/* ------------------------------------------------------------------ */
function Dashboard({
  nightscout,
}: {
  nightscout: ReturnType<typeof useNightscout>;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'insulin' | 'carbs' | 'both';
    insulin: number;
    carbs: number;
    notes: string;
  }>({ open: false, type: 'insulin', insulin: 0, carbs: 0, notes: '' });

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      nightscout.fetchTreatments(),
      nightscout.fetchCGMEntries(),
      nightscout.fetchDeviceStatus(),
    ]);
    setIsRefreshing(false);
  }, [nightscout]);

  useEffect(() => {
    refreshAll();
    // Auto-refresh every 60 seconds
    const interval = setInterval(refreshAll, 60000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  const handleTreatmentSubmit = (
    type: 'insulin' | 'carbs' | 'both',
    insulin: number,
    carbs: number,
    notes: string
  ) => {
    setConfirmDialog({ open: true, type, insulin, carbs, notes });
  };

  const handleConfirm = async () => {
    try {
      await nightscout.submitTreatment({
        type: confirmDialog.type,
        insulin: confirmDialog.insulin,
        carbs: confirmDialog.carbs,
        notes: confirmDialog.notes,
      });
      setConfirmDialog((prev) => ({ ...prev, open: false }));
    } catch {
      // Error is handled in the hook
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-white font-semibold text-sm">AndroidAPS Remote</h1>
              <p className="text-xs text-slate-500">远程控制终端</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-green-500/30 text-green-400 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />
              已连接
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={nightscout.disconnect}
              className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"
            >
              <Unlink className="w-4 h-4 mr-1" />
              断开
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Status dashboard */}
        <StatusDashboard
          cgmEntries={nightscout.cgmEntries}
          deviceStatus={nightscout.deviceStatus}
          onRefresh={refreshAll}
          isRefreshing={isRefreshing}
        />

        <Separator className="bg-slate-800/50" />

        {/* Main panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Treatment form */}
          <TreatmentForm onSubmit={handleTreatmentSubmit} isLoading={nightscout.isLoading} />

          {/* Treatment history */}
          <div className="space-y-4">
            <Tabs defaultValue="history" className="w-full">
              <TabsList className="bg-slate-800/50 border border-slate-700/50">
                <TabsTrigger value="history" className="text-slate-300 data-[state=active]:text-white">
                  治疗记录
                </TabsTrigger>
                <TabsTrigger value="cgm" className="text-slate-300 data-[state=active]:text-white">
                  血糖趋势
                </TabsTrigger>
              </TabsList>

              <TabsContent value="history" className="mt-4">
                <TreatmentHistory treatments={nightscout.treatments} />
              </TabsContent>

              <TabsContent value="cgm" className="mt-4">
                <Card className="border-slate-700/50 bg-slate-900/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-lg flex items-center gap-2">
                      <Droplets className="w-5 h-5 text-cyan-400" />
                      血糖趋势 (最近 1 小时)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {nightscout.cgmEntries.length > 0 ? (
                      <div className="space-y-1">
                        {/* Simple visual chart */}
                        <div className="flex items-end gap-1 h-32 px-2">
                          {nightscout.cgmEntries
                            .slice()
                            .reverse()
                            .map((entry: { _id: string; sgv: number; direction: string; dateString: string }) => {
                              const height = Math.min(
                                100,
                                Math.max(5, ((entry.sgv - 40) / 300) * 100)
                              );
                              return (
                                <div
                                  key={entry._id}
                                  className="flex-1 flex flex-col items-center gap-1"
                                >
                                  <span className="text-[10px] text-slate-500">
                                    {entry.sgv}
                                  </span>
                                  <div
                                    className={`w-full rounded-t ${
                                      entry.sgv >= 70 && entry.sgv <= 180
                                        ? 'bg-green-500/60'
                                        : entry.sgv > 180
                                          ? 'bg-amber-500/60'
                                          : 'bg-red-500/60'
                                    }`}
                                    style={{ height: `${height}%` }}
                                  />
                                  <span className="text-[9px] text-slate-600">
                                    {new Date(entry.dateString).toLocaleTimeString('zh-CN', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                        {/* Target range indicator */}
                        <div className="flex items-center gap-2 mt-2 px-2">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-green-500/60" />
                            <span className="text-[10px] text-slate-500">目标范围</span>
                          </div>
                          <span className="text-[10px] text-slate-600">70-180 mg/dL</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm text-center py-8">暂无血糖数据</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Error display */}
        {nightscout.error && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <p className="text-sm text-red-400 font-medium">操作失败</p>
                <p className="text-xs text-red-400/70">{nightscout.error}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-red-400 hover:text-red-300"
                onClick={() => nightscout.setError(null)}
              >
                关闭
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              确认输注操作
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              请仔细核对以下输注信息，确认无误后点击 &quot;确认执行&quot;。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4 space-y-3">
            {(confirmDialog.type === 'insulin' || confirmDialog.type === 'both') && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2">
                  <Syringe className="w-5 h-5 text-amber-400" />
                  <span className="text-amber-300 font-medium">胰岛素</span>
                </div>
                <span className="text-2xl font-bold text-amber-400">
                  {confirmDialog.insulin} U
                </span>
              </div>
            )}
            {(confirmDialog.type === 'carbs' || confirmDialog.type === 'both') && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2">
                  <Wheat className="w-5 h-5 text-green-400" />
                  <span className="text-green-300 font-medium">碳水化合物</span>
                </div>
                <span className="text-2xl font-bold text-green-400">
                  {confirmDialog.carbs} g
                </span>
              </div>
            )}
            {confirmDialog.notes && (
              <div className="p-3 rounded-lg bg-slate-800/50">
                <span className="text-xs text-slate-500">备注：</span>
                <span className="text-sm text-slate-300 ml-1">{confirmDialog.notes}</span>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700">
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-cyan-600 hover:bg-cyan-700 text-white font-medium"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              确认执行
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Root Page                                                          */
/* ------------------------------------------------------------------ */
export default function Home() {
  const nightscout = useNightscout();

  const handleConnect = async (url: string, secret: string) => {
    return nightscout.testConnection({ url, apiSecret: secret });
  };

  if (!nightscout.isConnected) {
    return (
      <ConnectionScreen
        onConnect={handleConnect}
        isLoading={nightscout.isLoading}
        error={nightscout.error}
      />
    );
  }

  return <Dashboard nightscout={nightscout} />;
}
