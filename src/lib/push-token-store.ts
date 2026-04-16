import { createHash } from "crypto";
import { rtDel, rtExpire, rtGet, rtSAdd, rtSMembers, rtSRem, rtSetEx } from "@/lib/redis-runtime";

const PUSH_REG_TTL_SECONDS = 24 * 60 * 60;
const MAX_TOKENS_PER_DEVICE = 3;

export interface PushRegistrationRecord {
  installId: string;
  fcmTokens: string[];
  ticketUuid: string;
  userEmpresaId: number;
  userRolIdEmpresa: number;
  condominioId: number;
  updatedAt: string;
}

function dhash(installId: string): string {
  return createHash("sha256").update(installId.trim(), "utf8").digest("hex");
}

function regKey(installId: string): string {
  return `atc:push:reg:${dhash(installId)}`;
}

function ticketInstallsKey(ticketUuid: string): string {
  return `atc:push:ticket:${ticketUuid}`;
}

export async function saveFcmTokenForTicket(params: {
  installId: string;
  fcmToken: string;
  ticketUuid: string;
  userEmpresaId: number;
  userRolIdEmpresa: number;
  condominioId: number;
}): Promise<void> {
  const { installId, fcmToken, ticketUuid, userEmpresaId, userRolIdEmpresa, condominioId } = params;
  const key = regKey(installId);
  const raw = await rtGet(key);
  let record: PushRegistrationRecord;
  if (raw) {
    try {
      record = JSON.parse(raw) as PushRegistrationRecord;
    } catch {
      record = emptyRecord(installId, ticketUuid, userEmpresaId, userRolIdEmpresa, condominioId);
    }
  } else {
    record = emptyRecord(installId, ticketUuid, userEmpresaId, userRolIdEmpresa, condominioId);
  }
  if (record.ticketUuid !== ticketUuid) {
    await removeInstallFromTicketIndex(record.ticketUuid, installId);
    record.ticketUuid = ticketUuid;
  }
  const merged = [fcmToken, ...record.fcmTokens.filter((t) => t !== fcmToken)].slice(0, MAX_TOKENS_PER_DEVICE);
  record.fcmTokens = merged;
  record.updatedAt = new Date().toISOString();
  await rtSetEx(key, PUSH_REG_TTL_SECONDS, JSON.stringify(record));
  const h = dhash(installId);
  await rtSAdd(ticketInstallsKey(ticketUuid), h);
  await rtExpire(ticketInstallsKey(ticketUuid), PUSH_REG_TTL_SECONDS);
  await rtExpire(key, PUSH_REG_TTL_SECONDS);
}

function emptyRecord(
  installId: string,
  ticketUuid: string,
  userEmpresaId: number,
  userRolIdEmpresa: number,
  condominioId: number,
): PushRegistrationRecord {
  return {
    installId,
    fcmTokens: [],
    ticketUuid,
    userEmpresaId,
    userRolIdEmpresa,
    condominioId,
    updatedAt: new Date().toISOString(),
  };
}

async function removeInstallFromTicketIndex(ticketUuid: string, installId: string): Promise<void> {
  await rtSRem(ticketInstallsKey(ticketUuid), dhash(installId));
}

export async function removeFcmToken(params: { installId: string; fcmToken?: string; ticketUuid: string }): Promise<void> {
  const key = regKey(params.installId);
  const raw = await rtGet(key);
  if (!raw) return;
  try {
    const record = JSON.parse(raw) as PushRegistrationRecord;
    if (params.fcmToken) {
      record.fcmTokens = record.fcmTokens.filter((t) => t !== params.fcmToken);
    } else {
      record.fcmTokens = [];
    }
    if (record.fcmTokens.length === 0) {
      await rtDel(key);
      await rtSRem(ticketInstallsKey(params.ticketUuid), dhash(params.installId));
    } else {
      record.updatedAt = new Date().toISOString();
      await rtSetEx(key, PUSH_REG_TTL_SECONDS, JSON.stringify(record));
    }
  } catch {
    await rtDel(key);
    await rtSRem(ticketInstallsKey(params.ticketUuid), dhash(params.installId));
  }
}

/** Obtiene todos los tokens FCM asociados a un ticket (varios dispositivos / reintentos). */
export async function collectFcmTokensForTicket(ticketUuid: string): Promise<string[]> {
  const hashes = await rtSMembers(ticketInstallsKey(ticketUuid));
  const tokens: string[] = [];
  for (const h of hashes) {
    const key = `atc:push:reg:${h}`;
    const raw = await rtGet(key);
    if (!raw) continue;
    try {
      const record = JSON.parse(raw) as PushRegistrationRecord;
      if (record.ticketUuid === ticketUuid) {
        tokens.push(...record.fcmTokens);
      }
    } catch {
      /* ignore */
    }
  }
  return [...new Set(tokens)];
}
