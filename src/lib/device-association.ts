import { createHash } from "crypto";
import { z } from "zod";
import { rtDel, rtGet, rtSetEx } from "@/lib/redis-runtime";
import type { DeviceQueueAssociation, QueueTicket } from "@/types/queue";

const DEVICE_ASSOC_TTL_SECONDS = 24 * 60 * 60;

export const DeviceFingerprintSchema = z.object({
  installId: z.string().min(8).max(128),
  platform: z.string().min(2).max(64),
  language: z.string().min(2).max(32),
  timezone: z.string().min(2).max(64),
  screenWidth: z.number().int().min(1).max(10000),
  screenHeight: z.number().int().min(1).max(10000),
  pixelRatio: z.number().min(0.5).max(10),
});

export type DeviceFingerprintInput = z.infer<typeof DeviceFingerprintSchema>;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Clave estable por navegador/perfil. No usar dimensiones de pantalla: cambian con zoom,
 * barra de URL móvil u orientación y provocaban que `clear` y `current` apuntaran a claves distintas.
 */
function deviceHash(device: DeviceFingerprintInput): string {
  return sha256(device.installId.trim());
}

/** Hash previo (pantalla + DPR); solo para leer/borrar datos guardados antes del cambio de clave. */
function legacyDeviceHash(device: DeviceFingerprintInput): string {
  return sha256(
    [
      device.installId.trim(),
      device.platform.trim(),
      device.language.trim(),
      device.timezone.trim(),
      String(device.screenWidth),
      String(device.screenHeight),
      String(device.pixelRatio),
    ].join("|"),
  );
}

function queueDeviceKey(params: {
  deviceHash: string;
  condominioId: number;
  empresaId: number;
}): string {
  return `atc:device:queue:${params.deviceHash}:${params.condominioId}:${params.empresaId}`;
}

export async function saveDeviceQueueAssociation(params: {
  device: DeviceFingerprintInput;
  ticket: QueueTicket;
  condominioId: number;
  empresaId: number;
  userRolIdEmpresa: number;
  ip: string;
  userAgent: string;
}): Promise<void> {
  const parsedDevice = DeviceFingerprintSchema.parse(params.device);
  const dHash = deviceHash(parsedDevice);
  const key = queueDeviceKey({
    deviceHash: dHash,
    condominioId: params.condominioId,
    empresaId: params.empresaId,
  });

  const payload: DeviceQueueAssociation = {
    ticket: params.ticket,
    condominioId: params.condominioId,
    empresaId: params.empresaId,
    userRolIdEmpresa: params.userRolIdEmpresa,
    linkedAt: new Date().toISOString(),
    ipHash: sha256(params.ip || "unknown"),
    userAgentHash: sha256(params.userAgent || "unknown"),
    deviceHash: dHash,
  };
  await rtSetEx(key, DEVICE_ASSOC_TTL_SECONDS, JSON.stringify(payload));
}

export async function getDeviceQueueAssociation(params: {
  device: DeviceFingerprintInput;
  condominioId: number;
  empresaId: number;
}): Promise<DeviceQueueAssociation | null> {
  const parsedDevice = DeviceFingerprintSchema.parse(params.device);
  const dHash = deviceHash(parsedDevice);
  const key = queueDeviceKey({
    deviceHash: dHash,
    condominioId: params.condominioId,
    empresaId: params.empresaId,
  });
  const raw = await rtGet(key);
  if (raw) {
    try {
      return JSON.parse(raw) as DeviceQueueAssociation;
    } catch {
      return null;
    }
  }

  const legacyKey = queueDeviceKey({
    deviceHash: legacyDeviceHash(parsedDevice),
    condominioId: params.condominioId,
    empresaId: params.empresaId,
  });
  const legacyRaw = await rtGet(legacyKey);
  if (!legacyRaw) return null;
  try {
    const assoc = JSON.parse(legacyRaw) as DeviceQueueAssociation;
    // Migrar a la clave nueva para próximas lecturas/borrados coherentes
    await rtSetEx(key, DEVICE_ASSOC_TTL_SECONDS, legacyRaw);
    await rtDel(legacyKey);
    return assoc;
  } catch {
    return null;
  }
}

/**
 * Elimina la asociación dispositivo ↔ ticket (p. ej. tras atención completada)
 * para permitir un nuevo turno al escanear el QR de nuevo.
 */
export async function deleteDeviceQueueAssociation(params: {
  device: DeviceFingerprintInput;
  condominioId: number;
  empresaId: number;
}): Promise<void> {
  const parsedDevice = DeviceFingerprintSchema.parse(params.device);
  const dHash = deviceHash(parsedDevice);
  const key = queueDeviceKey({
    deviceHash: dHash,
    condominioId: params.condominioId,
    empresaId: params.empresaId,
  });
  const legacyKey = queueDeviceKey({
    deviceHash: legacyDeviceHash(parsedDevice),
    condominioId: params.condominioId,
    empresaId: params.empresaId,
  });
  await Promise.all([rtDel(key), rtDel(legacyKey)]);
}
