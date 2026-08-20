// ============================================================
// In-Memory Command Store & Device Registry
// ============================================================
// In production, replace with database (Supabase/PostgreSQL)
// ============================================================

import type {
  DeviceInfo,
  RemoteCommand,
  CommandStatus,
} from '@/lib/types';

// --- Device Registry ---
const deviceRegistry = new Map<string, DeviceInfo>();

export function registerDevice(phone: string, deviceId: string, appVersion: string): DeviceInfo {
  const key = `${phone}:${deviceId}`;
  const now = Date.now();
  const existing = deviceRegistry.get(key);
  const device: DeviceInfo = {
    phone,
    deviceId,
    appVersion,
    registeredAt: existing?.registeredAt ?? now,
    lastHeartbeat: now,
    status: 'online',
  };
  deviceRegistry.set(key, device);
  return device;
}

export function updateHeartbeat(phone: string, deviceId: string): DeviceInfo | null {
  const key = `${phone}:${deviceId}`;
  const device = deviceRegistry.get(key);
  if (!device) return null;
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
  return cleaned;
}

// Run cleanup every 30 seconds
if (typeof globalThis !== 'undefined') {
  setInterval(cleanupExpiredCommands, 30000);
}
