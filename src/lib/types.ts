export type ConnectionMode = 'nightscout' | 'direct';

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

export type AppConfig = NightscoutConfig | DirectAPIConfig;

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
