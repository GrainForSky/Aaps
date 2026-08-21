// ============================================================
// In-Memory Command Store & Device Registry
// ============================================================
// In production, replace with database (Supabase/PostgreSQL)
// ============================================================

import type {
  DeviceInfo,
  RemoteCommand,
  CommandStatus,
  RateLimitEntry,
} from '@/lib/types';
import { RATE_LIMITS } from '@/lib/types';
import crypto from 'crypto';

// --- Device Registry ---
const deviceRegistry = new Map<string, DeviceInfo>();
// Token -> phone:deviceId mapping for fast lookup
const tokenToDevice = new Map<string, string>();

/**
 * Generate a secure device token
 */
export function generateDeviceToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Register a device and return device token
 */
export function registerDevice(phone: string, deviceId: string, appVersion: string): DeviceInfo & { deviceToken: string } {
  const key = `${phone}:${deviceId}`;
  const now = Date.now();
  const existing = deviceRegistry.get(key);
  const deviceToken = existing?.deviceToken ?? generateDeviceToken();
  const device: DeviceInfo = {
    phone,
    deviceId,
    deviceToken,
    appVersion,
    registeredAt: existing?.registeredAt ?? now,
    lastHeartbeat: now,
    status: 'online',
  };
  deviceRegistry.set(key, device);
  tokenToDevice.set(deviceToken, key);
  return { ...device, deviceToken };
}

/**
 * Validate device token and return device info
 */
export function validateDeviceToken(deviceToken: string): DeviceInfo | null {
  const key = tokenToDevice.get(deviceToken);
  if (!key) return null;
  const device = deviceRegistry.get(key);
  if (!device) return null;
  // Token must match
  if (device.deviceToken !== deviceToken) return null;
  return device;
}

export function updateHeartbeat(phone: string, deviceId: string, deviceToken: string): DeviceInfo | null {
  const key = `${phone}:${deviceId}`;
  const device = deviceRegistry.get(key);
  if (!device) return null;
  // Validate token
  if (device.deviceToken !== deviceToken) return null;
  device.lastHeartbeat = Date.now();
  device.status = 'online';
  return device;
}

export function getDevice(phone: string, deviceId: string): DeviceInfo | null {
  const key = `${phone}:${deviceId}`;
  return deviceRegistry.get(key) ?? null;
}

export function getDeviceByPhone(phone: string): DeviceInfo | null {
  for (const device of deviceRegistry.values()) {
    if (device.phone === phone) return device;
  }
  return null;
}

export function getDeviceStatus(phone: string): 'online' | 'offline' | 'not_registered' {
  const device = getDeviceByPhone(phone);
  if (!device) return 'not_registered';
  const elapsed = Date.now() - device.lastHeartbeat;
  if (elapsed > 60000) {
    device.status = 'offline';
    return 'offline';
  }
  return 'online';
}

// --- Command Queue ---
const commandQueue = new Map<string, RemoteCommand>();

export function createCommand(
  phone: string,
  type: 'bolus' | 'carbs' | 'mixed' | 'suspend' | 'resume' | 'status',
  insulin?: number,
  carbs?: number,
): RemoteCommand {
  const id = `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const command: RemoteCommand = {
    id,
    phone,
    type,
    insulin,
    carbs,
    status: 'pending',
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000, // 5 minutes expiry
  };
  commandQueue.set(id, command);
  return command;
}

export function getPendingCommands(phone: string): RemoteCommand[] {
  const now = Date.now();
  const commands: RemoteCommand[] = [];
  for (const cmd of commandQueue.values()) {
    if (cmd.phone === phone && cmd.status === 'pending' && now < cmd.expiresAt) {
      commands.push(cmd);
    }
  }
  return commands;
}

export function updateCommandStatus(
  id: string,
  status: CommandStatus,
  result?: { success: boolean; message: string; treatmentId?: string },
): RemoteCommand | null {
  const cmd = commandQueue.get(id);
  if (!cmd) return null;
  cmd.status = status;
  if (status === 'completed' || status === 'failed') {
    cmd.executedAt = Date.now();
  }
  if (result) {
    cmd.result = result;
  }
  return cmd;
}

export function getCommand(id: string): RemoteCommand | null {
  return commandQueue.get(id) ?? null;
}

// --- Rate Limiting ---
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check rate limit for a given key
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkRateLimit(key: string, limit: { maxRequests: number; windowMs: number }): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.firstRequest > limit.windowMs) {
    // New window
    rateLimitStore.set(key, { count: 1, firstRequest: now, lastRequest: now });
    return { allowed: true, remaining: limit.maxRequests - 1, resetAt: now + limit.windowMs };
  }

  if (entry.count >= limit.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.firstRequest + limit.windowMs };
  }

  entry.count++;
  entry.lastRequest = now;
  return { allowed: true, remaining: limit.maxRequests - entry.count, resetAt: entry.firstRequest + limit.windowMs };
}

// --- Cleanup expired commands (call periodically) ---
export function cleanupExpiredCommands(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, cmd] of commandQueue.entries()) {
    if (now > cmd.expiresAt && cmd.status === 'pending') {
      cmd.status = 'expired';
      cleaned++;
    }
  }
  // Also clean up devices that haven't heartbeat in 2 minutes
  for (const [key, device] of deviceRegistry.entries()) {
    if (now - device.lastHeartbeat > 120000) {
      device.status = 'offline';
    }
  }
  // Clean up old rate limit entries
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.firstRequest > 300000) { // 5 minutes
      rateLimitStore.delete(key);
    }
  }
  return cleaned;
}

// Run cleanup every 30 seconds
if (typeof globalThis !== 'undefined') {
  setInterval(cleanupExpiredCommands, 30000);
}
