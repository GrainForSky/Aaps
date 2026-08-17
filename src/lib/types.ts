// ============================================================
// AndroidAPS Remote Control - Type Definitions
// Architecture: SMS Gateway (commands) + Nightscout (data)
// ============================================================

// --- User & Auth ---
export interface UserSession {
  phoneNumber: string;
  loggedInAt: number;
}

// --- Configuration ---
export interface SMSGatewayConfig {
  provider: 'generic' | 'twilio' | 'aliyun' | 'tencent';
  apiUrl: string;
  apiKey: string;
  apiSecret?: string;
  /** 发送方号码（SMS 网关分配的号码） */
  fromNumber: string;
  /** 接收方号码（AndroidAPS 手机号，默认=登录手机号） */
  toNumber: string;
  /** 短信签名（阿里云/腾讯云需要） */
  signName?: string;
  /** 短信模板 ID（阿里云/腾讯云需要） */
  templateCode?: string;
}

export interface NightscoutConfig {
  url: string;
  apiSecret: string;
}

export interface AppConfig {
  sms: SMSGatewayConfig;
  nightscout: NightscoutConfig;
}

// --- SMS Command Format (AndroidAPS SMS Communicator) ---
export type SMSCommandType = 'bolus' | 'carbs' | 'status' | 'suspend' | 'resume' | 'target';

export interface SMSCommand {
  type: SMSCommandType;
  /** 格式化后的 SMS 文本，如 "BOLUS 2.5" */
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
} as const;

// --- SMS Send Result ---
export interface SMSSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// --- SMS Provider Presets ---
export interface SMSProviderPreset {
  name: string;
  provider: SMSGatewayConfig['provider'];
  apiUrl: string;
  placeholder: {
    apiUrl: string;
    apiKey: string;
    apiSecret?: string;
    signName?: string;
    templateCode?: string;
  };
  helpText: string;
}

export const SMS_PROVIDER_PRESETS: SMSProviderPreset[] = [
  {
    name: '阿里云短信',
    provider: 'aliyun',
    apiUrl: 'https://dysmsapi.aliyuncs.com',
    placeholder: {
      apiUrl: 'https://dysmsapi.aliyuncs.com',
      apiKey: 'AccessKeyId',
      apiSecret: 'AccessKeySecret',
      signName: '短信签名',
      templateCode: 'SMS_XXXXXX',
    },
    helpText: '需要开通阿里云短信服务，创建签名和模板。模板变量需包含 ${content}。',
  },
  {
    name: '腾讯云短信',
    provider: 'tencent',
    apiUrl: 'https://sms.tencentcloudapi.com',
    placeholder: {
      apiUrl: 'https://sms.tencentcloudapi.com',
      apiKey: 'SecretId',
      apiSecret: 'SecretKey',
      signName: '短信签名',
      templateCode: '模板 ID',
    },
    helpText: '需要开通腾讯云短信服务，创建签名和模板。',
  },
  {
    name: 'Twilio',
    provider: 'twilio',
    apiUrl: 'https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json',
    placeholder: {
      apiUrl: 'https://api.twilio.com/2010-04-01/Accounts/ACxxxx/Messages.json',
      apiKey: 'Account SID',
      apiSecret: 'Auth Token',
    },
    helpText: 'Twilio 可直接发送短信内容，无需模板。apiUrl 中需替换 AccountSid。',
  },
  {
    name: '通用 HTTP 网关',
    provider: 'generic',
    apiUrl: '',
    placeholder: {
      apiUrl: 'https://your-sms-gateway.com/send',
      apiKey: 'API Key',
    },
    helpText: '自定义 HTTP 网关，POST 请求需包含 to 和 message 参数。',
  },
];
