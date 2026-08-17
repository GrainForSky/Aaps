export type ConnectionMode = 'nightscout' | 'direct' | 'sms';

export type DataSourceMode = 'nightscout' | 'direct';

export interface NightscoutConfig {
  mode: 'nightscout';
  url: string;
  apiSecret: string;
}

export interface DirectAPIConfig {
  mode: 'direct';
  url: string;
  token?: string;
}

export interface SMSGatewayConfig {
  provider: 'generic' | 'twilio' | 'aliyun' | 'tencent';
  apiUrl: string;
  apiKey: string;
  apiSecret?: string;
  fromNumber?: string;
  toNumber: string;
  signName?: string;
  templateCode?: string;
}

export interface SMSConnectionConfig {
  mode: 'sms';
  gateway: SMSGatewayConfig;
  dataSource: {
    mode: DataSourceMode;
    nightscout?: { url: string; apiSecret: string };
    direct?: { url: string; token?: string };
  };
}

export type AppConfig = NightscoutConfig | DirectAPIConfig | SMSConnectionConfig;

export interface Treatment {
  type: 'insulin' | 'carbs' | 'both';
  insulin?: number;
  carbs?: number;
  notes?: string;
}

export interface TreatmentRecord {
  _id: string;
  created_at: string;
  enteredBy: string;
  eventType: string;
  insulin?: number;
  carbs?: number;
  notes?: string;
}

export interface CGMEntry {
  _id: string;
  sgv: number;
  direction: string;
  date: number;
  dateString: string;
  type: string;
  device: string;
}

export interface DeviceStatus {
  _id: string;
  created_at: string;
  device: string;
  pump?: {
    reservoir?: number;
    battery?: {
      percent?: number;
      voltage?: number;
    };
    status?: {
      status?: string;
      bolusing?: boolean;
      suspended?: boolean;
    };
  };
  openaps?: {
    suggested?: {
      reason?: string;
      units?: number;
    };
    iob?: {
      iob?: number;
      activity?: number;
    };
  };
}

export interface SafetyLock {
  insulinLockedUntil: number | null;
  carbsLockedUntil: number | null;
  lastBolusTime: number | null;
  lastCarbsTime: number | null;
}

export const SAFETY_RULES = {
  INSULIN_LOCK_MINUTES: 15,
  CARBS_LOCK_MINUTES: 1,
  MAX_BOLUS_UNITS: 25,
  MAX_CARBS_GRAMS: 150,
} as const;

// Direct API command result types
export type CommandStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'timeout';

export interface DirectAPICommandResponse {
  status: 'accepted';
  requestId: string;
  type: 'bolus' | 'carbs' | 'treatment';
  insulin?: number;
  carbs?: number;
  message: string;
  resultUrl: string;
}

export interface DirectAPICommandResult {
  requestId: string;
  type: 'bolus' | 'carbs' | 'treatment';
  status: CommandStatus;
  requestedAmount: number;
  deliveredAmount: number;
  success: boolean;
  message: string;
  createdAt: number;
  completedAt?: number;
}

// Retry configuration
export interface RetryConfig {
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  pollIntervalMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  retryDelayMs: 3000,
  timeoutMs: 30000,
  pollIntervalMs: 2000,
};
