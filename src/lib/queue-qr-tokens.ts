import { createHash, randomUUID } from "crypto";
import { decodeAndVerifyToken, encodeToken } from "@/lib/crypto-tokens";
import { rtExists, rtGet, rtSetEx } from "@/lib/redis-runtime";
import type { QREntryPayload, QueueSessionPayload } from "@/types/queue";

const QR_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 15 * 60 * 1000;
function getQRSecret(): string {
  return process.env.QR_TOKEN_SECRET || process.env.SESSION_SECRET || "CHANGE_THIS_IN_PRODUCTION";
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || "CHANGE_THIS_IN_PRODUCTION";
}

export function generateQREntryToken(params: {
  condominioId: number;
  empresaId?: number | null;
  kid?: string;
}): string {
  const now = Date.now();
  const payload: QREntryPayload = {
    jti: randomUUID(),
    scope: "queue:entry",
    condominioId: params.condominioId,
    empresaId: params.empresaId ?? null,
    issuedAt: now,
    expiresAt: now + QR_TTL_MS,
    kid: params.kid || process.env.QR_ACTIVE_KID || "k1",
    version: 1,
  };

  return encodeToken(payload, getQRSecret());
}

function revokedJtiKey(jti: string): string {
  return `atc:qr:revoked:${jti}`;
}

function queueSessionKey(queueSessionId: string): string {
  return `atc:queue:session:${queueSessionId}`;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function validateQREntryToken(token: string): Promise<QREntryPayload | null> {
  const data = decodeAndVerifyToken<QREntryPayload>(token, getQRSecret());
  if (!data) return null;
  if (data.scope !== "queue:entry") return null;
  if (Date.now() > data.expiresAt) return null;
  if (!Number.isInteger(data.condominioId) || data.condominioId <= 0) return null;
  if (await rtExists(revokedJtiKey(data.jti))) return null;
  return data;
}

function createQueueSessionToken(params: {
  condominioId: number;
  empresaId?: number | null;
}): string {
  const now = Date.now();
  const payload: QueueSessionPayload = {
    queueSessionId: randomUUID(),
    condominioId: params.condominioId,
    empresaId: params.empresaId ?? null,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  return encodeToken(payload, getSessionSecret());
}

export function validateQueueSessionToken(token: string): QueueSessionPayload | null {
  const data = decodeAndVerifyToken<QueueSessionPayload>(token, getSessionSecret());
  if (!data) return null;
  if (Date.now() > data.expiresAt) return null;
  if (!Number.isInteger(data.condominioId) || data.condominioId <= 0) return null;
  return data;
}

export async function issueQueueSession(params: {
  condominioId: number;
  empresaId?: number | null;
  ip: string;
  userAgent: string;
}): Promise<{ queueSessionToken: string; payload: QueueSessionPayload }> {
  const queueSessionToken = createQueueSessionToken({
    condominioId: params.condominioId,
    empresaId: params.empresaId,
  });
  const payload = validateQueueSessionToken(queueSessionToken);
  if (!payload) throw new Error("No se pudo crear sesión de cola");

  const ttlSeconds = Math.max(1, Math.ceil((payload.expiresAt - Date.now()) / 1000));
  await rtSetEx(
    queueSessionKey(payload.queueSessionId),
    ttlSeconds,
    JSON.stringify({
      condominioId: payload.condominioId,
      empresaId: payload.empresaId,
      ipHash: fingerprint(params.ip || "unknown"),
      uaHash: fingerprint(params.userAgent || "unknown"),
      expiresAt: payload.expiresAt,
    }),
  );

  return { queueSessionToken, payload };
}

export async function assertQueueSessionAccess(
  queueSessionToken: string,
  context: { ip: string; userAgent: string },
): Promise<QueueSessionPayload | null> {
  const payload = validateQueueSessionToken(queueSessionToken);
  if (!payload) return null;
  const raw = await rtGet(queueSessionKey(payload.queueSessionId));
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as {
      condominioId: number;
      empresaId: number | null;
      ipHash: string;
      uaHash: string;
      expiresAt: number;
    };
    if (Date.now() > session.expiresAt) return null;
    if (session.condominioId !== payload.condominioId) return null;
    if ((session.empresaId ?? null) !== (payload.empresaId ?? null)) return null;
    if (session.ipHash !== fingerprint(context.ip || "unknown")) return null;
    if (session.uaHash !== fingerprint(context.userAgent || "unknown")) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function revokeQREntryToken(token: string): Promise<boolean> {
  const data = decodeAndVerifyToken<QREntryPayload>(token, getQRSecret());
  if (!data?.jti) return false;
  const ttlSeconds = Math.max(1, Math.ceil((data.expiresAt - Date.now()) / 1000));
  await rtSetEx(revokedJtiKey(data.jti), ttlSeconds, "1");
  return true;
}
