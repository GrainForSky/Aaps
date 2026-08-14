'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAAPS } from '@/hooks/use-nightscout';
import { useSafetyLock, formatCountdown } from '@/hooks/use-safety-lock';
import { SAFETY_RULES } from '@/lib/types';
import type { SMSGatewayConfig } from '@/lib/types';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Server,
  Globe,
  Wifi,
  Info,
  MessageSquare,
  Lock,
  Timer,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Direction arrow helper                                             */
/* ------------------------------------------------------------------ */
function directionArrow(dir: string): string {
  const map: Record<string, string> = {
    Flat: '\u2192',
    FortyFiveUp: '\u2197',
    FortyFiveDown: '\u2198',
    SingleUp: '\u2191',
    SingleDown: '\u2193',
    DoubleUp: '\u21c8',
    DoubleDown: '\u21ca',
    NONE: '\u2014',
  };
  return map[dir] || '\u2014';
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
  onNightscoutConnect,
  onDirectConnect,
  onSMSConnect,
  isLoading,
  error,
}: {
  onNightscoutConnect: (url: string, secret: string) => Promise<boolean>;
  onDirectConnect: (url: string, token: string) => Promise<boolean>;
  onSMSConnect: (
    gateway: SMSGatewayConfig,
    dataSourceMode: 'nightscout' | 'direct',
    dataSourceConfig: { url: string; apiSecret?: string; token?: string }
  ) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}) {
  const [mode, setMode] = useState<'nightscout' | 'direct' | 'sms'>('sms');

  // Nightscout fields
  const [nsUrl, setNsUrl] = useState('');
  const [nsSecret, setNsSecret] = useState('');

  // Direct fields
  const [directUrl, setDirectUrl] = useState('');
  const [directToken, setDirectToken] = useState('');

  // SMS fields
  const [smsProvider, setSmsProvider] = useState<'generic' | 'twilio' | 'aliyun' | 'tencent'>('generic');
  const [smsApiUrl, setSmsApiUrl] = useState('');
  const [smsApiKey, setSmsApiKey] = useState('');
  const [smsApiSecret, setSmsApiSecret] = useState('');
  const [smsFromNumber, setSmsFromNumber] = useState('');
  const [smsToNumber, setSmsToNumber] = useState('');
  const [smsSignName, setSmsSignName] = useState('');
  const [smsTemplateCode, setSmsTemplateCode] = useState('');

  // SMS data source
  const [smsDataSource, setSmsDataSource] = useState<'nightscout' | 'direct'>('nightscout');
  const [smsDsUrl, setSmsDsUrl] = useState('');
  const [smsDsSecret, setSmsDsSecret] = useState('');
  const [smsDsToken, setSmsDsToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'nightscout') {
      await onNightscoutConnect(nsUrl.trim(), nsSecret.trim());
    } else if (mode === 'direct') {
      await onDirectConnect(directUrl.trim(), directToken.trim());
    } else {
      const gateway: SMSGatewayConfig = {
        provider: smsProvider,
        apiUrl: smsApiUrl.trim(),
        apiKey: smsApiKey.trim(),
        apiSecret: smsApiSecret.trim() || undefined,
        fromNumber: smsFromNumber.trim() || undefined,
        toNumber: smsToNumber.trim(),
        signName: smsSignName.trim() || undefined,
        templateCode: smsTemplateCode.trim() || undefined,
      };
      const dsConfig = smsDataSource === 'nightscout'
        ? { url: smsDsUrl.trim(), apiSecret: smsDsSecret.trim() }
        : { url: smsDsUrl.trim(), token: smsDsToken.trim() };
      await onSMSConnect(gateway, smsDataSource, dsConfig);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <Card className="w-full max-w-lg border-slate-700/50 bg-slate-900/80 backdrop-blur shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-2">
            <Activity className="w-8 h-8 text-cyan-400" />
          </div>
          <CardTitle className="text-2xl text-white">AndroidAPS Remote</CardTitle>
          <CardDescription className="text-slate-400">
            远程控制胰岛素泵 - 选择连接方式
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Mode selector */}
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setMode('sms')}
              className={`flex-1 py-3 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                mode === 'sms'
                  ? 'bg-cyan-500/15 ring-1 ring-cyan-500/50 text-cyan-300'
                  : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-300'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              SMS 网关
            </button>
            <button
              type="button"
              onClick={() => setMode('direct')}
              className={`flex-1 py-3 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                mode === 'direct'
                  ? 'bg-cyan-500/15 ring-1 ring-cyan-500/50 text-cyan-300'
                  : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-300'
              }`}
            >
              <Wifi className="w-4 h-4" />
              直接连接
            </button>
            <button
              type="button"
              onClick={() => setMode('nightscout')}
              className={`flex-1 py-3 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                mode === 'nightscout'
                  ? 'bg-cyan-500/15 ring-1 ring-cyan-500/50 text-cyan-300'
                  : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60 hover:text-slate-300'
              }`}
            >
              <Globe className="w-4 h-4" />
              Nightscout
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* SMS Gateway Mode */}
            {mode === 'sms' && (
              <>
                <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 mb-4">
                  <div className="flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-cyan-300/80">
                      <p className="font-medium text-cyan-300 mb-1">SMS 网关模式</p>
                      <p>通过 SMS 网关发送命令到 AndroidAPS 手机。AndroidAPS 的 SMS Communicator 会接收并执行命令。同时需要配置数据源用于读取状态和血糖数据。</p>
                    </div>
                  </div>
                </div>

                {/* SMS Gateway Config */}
                <div className="space-y-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                  <p className="text-xs font-medium text-slate-300 uppercase tracking-wider">SMS 网关配置</p>

                  <div className="space-y-2">
                    <Label className="text-slate-300 text-xs">短信服务商</Label>
                    <Select value={smsProvider} onValueChange={(v) => setSmsProvider(v as typeof smsProvider)}>
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="generic">通用 HTTP 网关</SelectItem>
                        <SelectItem value="twilio">Twilio</SelectItem>
                        <SelectItem value="aliyun">阿里云短信</SelectItem>
                        <SelectItem value="tencent">腾讯云短信</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300 text-xs">API 地址</Label>
                    <Input
                      placeholder="https://api.sms-provider.com/send"
                      value={smsApiUrl}
                      onChange={(e) => setSmsApiUrl(e.target.value)}
                      className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-xs">API Key</Label>
                      <Input
                        type="password"
                        placeholder="API Key"
                        value={smsApiKey}
                        onChange={(e) => setSmsApiKey(e.target.value)}
                        className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-xs">API Secret (可选)</Label>
                      <Input
                        type="password"
                        placeholder="API Secret"
                        value={smsApiSecret}
                        onChange={(e) => setSmsApiSecret(e.target.value)}
                        className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-xs">发送号码 (From)</Label>
                      <Input
                        placeholder="+1234567890"
                        value={smsFromNumber}
                        onChange={(e) => setSmsFromNumber(e.target.value)}
                        className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-xs">目标手机号 (To)</Label>
                      <Input
                        placeholder="+8613800138000"
                        value={smsToNumber}
                        onChange={(e) => setSmsToNumber(e.target.value)}
                        className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                        required
                      />
                    </div>
                  </div>

                  {(smsProvider === 'aliyun' || smsProvider === 'tencent') && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-slate-300 text-xs">签名</Label>
                        <Input
                          placeholder="应用签名"
                          value={smsSignName}
                          onChange={(e) => setSmsSignName(e.target.value)}
                          className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300 text-xs">模板编号</Label>
                        <Input
                          placeholder="SMS_XXXXX"
                          value={smsTemplateCode}
                          onChange={(e) => setSmsTemplateCode(e.target.value)}
                          className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Data Source Config */}
                <div className="space-y-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                  <p className="text-xs font-medium text-slate-300 uppercase tracking-wider">数据源配置 (用于读取状态)</p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSmsDataSource('nightscout')}
                      className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all ${
                        smsDataSource === 'nightscout'
                          ? 'bg-green-500/15 ring-1 ring-green-500/50 text-green-300'
                          : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60'
                      }`}
                    >
                      Nightscout
                    </button>
                    <button
                      type="button"
                      onClick={() => setSmsDataSource('direct')}
                      className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all ${
                        smsDataSource === 'direct'
                          ? 'bg-green-500/15 ring-1 ring-green-500/50 text-green-300'
                          : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60'
                      }`}
                    >
                      直接连接
                    </button>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300 text-xs">
                      {smsDataSource === 'nightscout' ? 'Nightscout URL' : '设备 HTTP 地址'}
                    </Label>
                    <Input
                      placeholder={smsDataSource === 'nightscout' ? 'https://your-nightscout.com' : 'http://192.168.1.100:8080'}
                      value={smsDsUrl}
                      onChange={(e) => setSmsDsUrl(e.target.value)}
                      className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                      required
                    />
                  </div>

                  {smsDataSource === 'nightscout' ? (
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-xs">API Secret</Label>
                      <Input
                        type="password"
                        placeholder="Nightscout API Secret"
                        value={smsDsSecret}
                        onChange={(e) => setSmsDsSecret(e.target.value)}
                        className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                        required
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-xs">访问令牌 (可选)</Label>
                      <Input
                        type="password"
                        placeholder="Bearer token"
                        value={smsDsToken}
                        onChange={(e) => setSmsDsToken(e.target.value)}
                        className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Direct Mode */}
            {mode === 'direct' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="directUrl" className="text-slate-300 flex items-center gap-2">
                    <Server className="w-4 h-4 text-cyan-400" />
                    设备 HTTP 地址
                  </Label>
                  <Input
                    id="directUrl"
                    placeholder="http://192.168.1.100:8080"
                    value={directUrl}
                    onChange={(e) => setDirectUrl(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    required
                  />
                  <p className="text-xs text-slate-500">
                    Android 设备上运行的 HTTP 服务器地址（局域网 IP + 端口）
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="directToken" className="text-slate-300">
                    访问令牌 (可选)
                  </Label>
                  <Input
                    id="directToken"
                    type="password"
                    placeholder="Bearer token (如果设备配置了认证)"
                    value={directToken}
                    onChange={(e) => setDirectToken(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                  />
                </div>
              </>
            )}

            {/* Nightscout Mode */}
            {mode === 'nightscout' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="nsUrl" className="text-slate-300 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    Nightscout URL
                  </Label>
                  <Input
                    id="nsUrl"
                    placeholder="https://your-nightscout.herokuapp.com"
                    value={nsUrl}
                    onChange={(e) => setNsUrl(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nsSecret" className="text-slate-300">
                    API Secret
                  </Label>
                  <Input
                    id="nsSecret"
                    type="password"
                    placeholder="Your Nightscout API secret"
                    value={nsSecret}
                    onChange={(e) => setNsSecret(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    required
                  />
                </div>
              </>
            )}

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
                  本工具仅用于辅助管理，所有操作请在医疗专业人员指导下进行。
                  为防止误操作，胰岛素输注后 15 分钟内不可再次输注，碳水记录后 1 分钟内不可再次记录。
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
/*  Safety Lock Banner                                                  */
/* ------------------------------------------------------------------ */
function SafetyLockBanner({
  isInsulinLocked,
  isCarbsLocked,
  insulinCountdown,
  carbsCountdown,
}: {
  isInsulinLocked: boolean;
  isCarbsLocked: boolean;
  insulinCountdown: number;
  carbsCountdown: number;
}) {
  if (!isInsulinLocked && !isCarbsLocked) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {isInsulinLocked && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Lock className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-amber-300 font-medium">胰岛素锁定</span>
          <Timer className="w-3 h-3 text-amber-400/60" />
          <span className="text-xs text-amber-400 font-mono">{formatCountdown(insulinCountdown)}</span>
        </div>
      )}
      {isCarbsLocked && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
          <Lock className="w-4 h-4 text-green-400" />
          <span className="text-xs text-green-300 font-medium">碳水锁定</span>
          <Timer className="w-3 h-3 text-green-400/60" />
          <span className="text-xs text-green-400 font-mono">{formatCountdown(carbsCountdown)}</span>
        </div>
      )}
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
/*  Treatment Form with Safety Lock                                     */
/* ------------------------------------------------------------------ */
function TreatmentForm({
  onSubmit,
  isLoading,
  isInsulinLocked,
  isCarbsLocked,
  insulinCountdown,
  carbsCountdown,
  isSMSMode,
}: {
  onSubmit: (type: 'insulin' | 'carbs' | 'both', insulin: number, carbs: number, notes: string) => void;
  isLoading: boolean;
  isInsulinLocked: boolean;
  isCarbsLocked: boolean;
  insulinCountdown: number;
  carbsCountdown: number;
  isSMSMode: boolean;
}) {
  const [mode, setMode] = useState<'insulin' | 'carbs' | 'both'>('insulin');
  const [insulin, setInsulin] = useState('');
  const [carbs, setCarbs] = useState('');
  const [notes, setNotes] = useState('');

  const quickInsulin = [0.5, 1.0, 1.5, 2.0, 3.0, 5.0];
  const quickCarbs = [5, 10, 15, 20, 30, 45];

  // Determine if submit should be disabled due to safety lock
  const isLockedBySafety =
    (mode === 'insulin' && isInsulinLocked) ||
    (mode === 'carbs' && isCarbsLocked) ||
    (mode === 'both' && (isInsulinLocked || isCarbsLocked));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedBySafety) return;
    const i = mode === 'carbs' ? 0 : parseFloat(insulin);
    const c = mode === 'insulin' ? 0 : parseFloat(carbs);
    if ((mode === 'insulin' || mode === 'both') && (isNaN(i) || i <= 0)) return;
    if ((mode === 'carbs' || mode === 'both') && (isNaN(c) || c <= 0)) return;
    onSubmit(mode, i, c, notes);
  };

  return (
    <Card className="border-slate-700/50 bg-slate-900/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-lg flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-cyan-400" />
            输注操作
          </CardTitle>
          {isSMSMode && (
            <Badge variant="outline" className="text-xs border-cyan-500/30 text-cyan-400">
              <MessageSquare className="w-3 h-3 mr-1" />
              SMS
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Safety lock warning */}
        {isLockedBySafety && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="text-xs text-amber-300">
                {mode === 'insulin' && isInsulinLocked && (
                  <span>胰岛素输注已锁定，请等待 <strong className="font-mono">{formatCountdown(insulinCountdown)}</strong> 后再试</span>
                )}
                {mode === 'carbs' && isCarbsLocked && (
                  <span>碳水记录已锁定，请等待 <strong className="font-mono">{formatCountdown(carbsCountdown)}</strong> 后再试</span>
                )}
                {mode === 'both' && (isInsulinLocked || isCarbsLocked) && (
                  <span>
                    {isInsulinLocked && `胰岛素锁定 ${formatCountdown(insulinCountdown)}`}
                    {isInsulinLocked && isCarbsLocked && ' / '}
                    {isCarbsLocked && `碳水锁定 ${formatCountdown(carbsCountdown)}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

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
                {isInsulinLocked && (
                  <span className="text-xs text-amber-400 ml-auto flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    {formatCountdown(insulinCountdown)}
                  </span>
                )}
              </Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="30"
                placeholder="0.0"
                value={insulin}
                onChange={(e) => setInsulin(e.target.value)}
                disabled={isInsulinLocked}
                className="bg-slate-800/50 border-slate-700 text-white text-2xl font-bold text-center h-14 placeholder:text-slate-600 disabled:opacity-50"
                required={mode === 'insulin'}
              />
              <div className="flex gap-2 flex-wrap">
                {quickInsulin.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setInsulin(d.toString())}
                    disabled={isInsulinLocked}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors border border-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
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
                {isCarbsLocked && (
                  <span className="text-xs text-green-400 ml-auto flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    {formatCountdown(carbsCountdown)}
                  </span>
                )}
              </Label>
              <Input
                type="number"
                step="1"
                min="0"
                max="200"
                placeholder="0"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                disabled={isCarbsLocked}
                className="bg-slate-800/50 border-slate-700 text-white text-2xl font-bold text-center h-14 placeholder:text-slate-600 disabled:opacity-50"
                required={mode === 'carbs'}
              />
              <div className="flex gap-2 flex-wrap">
                {quickCarbs.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCarbs(c.toString())}
                    disabled={isCarbsLocked}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors border border-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
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
              isLockedBySafety
                ? 'bg-slate-700 cursor-not-allowed'
                : mode === 'carbs'
                  ? 'bg-green-600 hover:bg-green-700'
                  : mode === 'both'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-amber-600 hover:bg-amber-700'
            }`}
            disabled={isLoading || isLockedBySafety}
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : isLockedBySafety ? (
              <Lock className="w-4 h-4 mr-2" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            {isLoading
              ? isSMSMode ? '短信发送中...' : '提交中...'
              : isLockedBySafety
                ? '安全锁定中'
                : isSMSMode
                  ? '通过短信发送'
                  : '提交输注'}
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
  aaps,
}: {
  aaps: ReturnType<typeof useAAPS>;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'insulin' | 'carbs' | 'both';
    insulin: number;
    carbs: number;
    notes: string;
  }>({ open: false, type: 'insulin', insulin: 0, carbs: 0, notes: '' });
  const safetyLock = useSafetyLock();

  const isSMSMode = aaps.config?.mode === 'sms';

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      aaps.fetchTreatments(),
      aaps.fetchCGMEntries(),
      aaps.fetchDeviceStatus(),
    ]);
    setIsRefreshing(false);
  }, [aaps]);

  useEffect(() => {
    refreshAll();
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
      await aaps.submitTreatment({
        type: confirmDialog.type,
        insulin: confirmDialog.insulin,
        carbs: confirmDialog.carbs,
        notes: confirmDialog.notes,
      });

      // Record safety lock after successful submission
      if (confirmDialog.type === 'insulin' || confirmDialog.type === 'both') {
        safetyLock.recordBolus();
      }
      if (confirmDialog.type === 'carbs' || confirmDialog.type === 'both') {
        safetyLock.recordCarbs();
      }

      setConfirmDialog((prev) => ({ ...prev, open: false }));
    } catch {
      // Error is handled in the hook
    }
  };

  const connectionMode =
    aaps.config?.mode === 'sms'
      ? 'SMS 网关'
      : aaps.config?.mode === 'direct'
        ? '直接连接'
        : 'Nightscout';

  const connectionUrl =
    aaps.config?.mode === 'sms'
      ? (aaps.config as { gateway: { toNumber: string } }).gateway.toNumber
      : (aaps.config as { url: string }).url;

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
              <p className="text-xs text-slate-500">
                {connectionMode} · {connectionUrl}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={`text-xs ${
                aaps.config?.mode === 'sms'
                  ? 'border-cyan-500/30 text-cyan-400'
                  : aaps.config?.mode === 'direct'
                    ? 'border-cyan-500/30 text-cyan-400'
                    : 'border-green-500/30 text-green-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse ${
                  aaps.config?.mode === 'sms' ? 'bg-cyan-400' : aaps.config?.mode === 'direct' ? 'bg-cyan-400' : 'bg-green-400'
                }`}
              />
              {connectionMode}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={aaps.disconnect}
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
        {/* Safety lock banner */}
        <SafetyLockBanner
          isInsulinLocked={safetyLock.isInsulinLocked}
          isCarbsLocked={safetyLock.isCarbsLocked}
          insulinCountdown={safetyLock.insulinCountdown}
          carbsCountdown={safetyLock.carbsCountdown}
        />

        {/* Status dashboard */}
        <StatusDashboard
          cgmEntries={aaps.cgmEntries}
          deviceStatus={aaps.deviceStatus}
          onRefresh={refreshAll}
          isRefreshing={isRefreshing}
        />

        <Separator className="bg-slate-800/50" />

        {/* Main panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Treatment form */}
          <TreatmentForm
            onSubmit={handleTreatmentSubmit}
            isLoading={aaps.isLoading}
            isInsulinLocked={safetyLock.isInsulinLocked}
            isCarbsLocked={safetyLock.isCarbsLocked}
            insulinCountdown={safetyLock.insulinCountdown}
            carbsCountdown={safetyLock.carbsCountdown}
            isSMSMode={isSMSMode}
          />

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
                <TreatmentHistory treatments={aaps.treatments} />
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
                    {aaps.cgmEntries.length > 0 ? (
                      <div className="space-y-1">
                        <div className="flex items-end gap-1 h-32 px-2">
                          {aaps.cgmEntries
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
        {aaps.error && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <p className="text-sm text-red-400 font-medium">操作失败</p>
                <p className="text-xs text-red-400/70">{aaps.error}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-red-400 hover:text-red-300"
                onClick={() => aaps.setError(null)}
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
              {isSMSMode ? '确认通过短信发送命令' : '确认输注操作'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {isSMSMode
                ? '命令将通过短信发送到 AndroidAPS 手机。请仔细核对以下信息，确认无误后点击 "确认发送"。'
                : '请仔细核对以下输注信息，确认无误后点击 "确认执行"。'}
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
            {isSMSMode && (
              <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-cyan-300">
                    将通过 SMS 网关发送命令到 AndroidAPS 手机
                  </span>
                </div>
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
              {isSMSMode ? '确认发送' : '确认执行'}
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
  const aaps = useAAPS();

  const handleNightscoutConnect = async (url: string, secret: string) => {
    return aaps.testNightscoutConnection(url, secret);
  };

  const handleDirectConnect = async (url: string, token: string) => {
    return aaps.testDirectConnection(url, token);
  };

  const handleSMSConnect = async (
    gateway: SMSGatewayConfig,
    dataSourceMode: 'nightscout' | 'direct',
    dataSourceConfig: { url: string; apiSecret?: string; token?: string }
  ) => {
    return aaps.testSMSConnection(gateway, dataSourceMode, dataSourceConfig);
  };

  if (!aaps.isConnected) {
    return (
      <ConnectionScreen
        onNightscoutConnect={handleNightscoutConnect}
        onDirectConnect={handleDirectConnect}
        onSMSConnect={handleSMSConnect}
        isLoading={aaps.isLoading}
        error={aaps.error}
      />
    );
  }

  return <Dashboard aaps={aaps} />;
}
