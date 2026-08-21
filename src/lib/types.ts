// ============================================================
// AndroidAPS Remote Control - Type Definitions
// Architecture: Device Polling (commands) + Nightscout (data)
// ============================================================

// --- User & Auth ---
export interface UserSession {
  phoneNumber: string;
  loggedInAt: number;
}

// --- Configuration ---
export interface NightscoutConfig {
  url: string;
  apiSecret: string;
}

export interface AppConfig {
  nightscout: NightscoutConfig;
}

// --- Device Registration ---
export interface DeviceInfo {
  phone: string;
  deviceId: string;
  deviceToken: string; // 设备认证令牌
  appVersion: string;
  registeredAt: number;
  lastHeartbeat: number;
  status: 'online' | 'offline';
}

export interface DeviceRegisterRequest {
  phone: string;
  deviceId: string;
  appVersion: string;
}

export interface DeviceRegisterResponse {
  success: boolean;
  message: string;
  deviceToken?: string; // 注册成功后返回设备令牌
}

export interface DeviceHeartbeatRequest {
  phone: string;
  deviceId: string;
  deviceToken: string; // 设备认证令牌
}

export interface DeviceAuthRequest {
  deviceToken: string;
}

// --- Command Queue ---
export type CommandType = 'bolus' | 'carbs' | 'mixed' | 'suspend' | 'resume' | 'status';

export type CommandStatus =
  | 'pending'      // 待执行
  | 'executing'    // 执行中
  | 'completed'    // 已完成
  | 'failed'       // 执行失败
  | 'expired';     // 已过期（超时未执行）

export interface RemoteCommand {
  id: string;
  phone: string;
  type: CommandType;
  insulin?: number;
  carbs?: number;
  status: CommandStatus;
  createdAt: number;
  executedAt?: number;
  result?: CommandResult;
  expiresAt: number;
}

export interface CommandResult {
  success: boolean;
  message: string;
  treatmentId?: string;
}

export interface CreateCommandRequest {
  phone: string;
  type: CommandType;
  insulin?: number;
  carbs?: number;
}

export interface CreateCommandResponse {
  success: boolean;
  commandId: string;
  message: string;
}

export interface PollCommandsResponse {
  commands: RemoteCommand[];
}

export interface ReportResultRequest {
  commandId: string;
  phone: string;
  deviceId: string;
  deviceToken: string; // 设备认证令牌
  success: boolean;
  message: string;
  treatmentId?: string;
}

// --- Command Format (AndroidAPS SMS Communicator compatible) ---
export interface FormattedCommand {
  type: CommandType;
  /** 格式化后的命令文本，如 "BOLUS 2.5" */
  text: string;
  /** 人类可读描述 */
  description: string;
}

// --- Nightscout Data Types ---
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

// --- Safety Lock ---
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
  COMMAND_EXPIRY_MINUTES: 5,
  POLL_INTERVAL_SECONDS: 5,
  HEARTBEAT_INTERVAL_SECONDS: 30,
  DEVICE_OFFLINE_SECONDS: 60,
} as const;

// --- Rate Limiting ---
export interface RateLimitEntry {
  count: number;
  firstRequest: number;
  lastRequest: number;
}

export const RATE_LIMITS = {
  COMMAND_CREATE: { maxRequests: 10, windowMs: 60000 }, // 每分钟最多10次命令创建
  DEVICE_REGISTER: { maxRequests: 5, windowMs: 60000 }, // 每分钟最多5次设备注册
  DEVICE_HEARTBEAT: { maxRequests: 30, windowMs: 60000 }, // 每分钟最多30次心跳
  NIGHTSCOUT_CONFIG: { maxRequests: 10, windowMs: 60000 }, // 每分钟最多10次配置测试
} as const;

// --- Input Validation ---
export const PHONE_REGEX = /^1[3-9]\d{9}$/; // 中国大陆手机号格式
export const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/; // 设备ID格式
