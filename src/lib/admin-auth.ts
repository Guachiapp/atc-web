import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { rtDel, rtExists, rtIncrWithExpiry, rtSetEx } from "@/lib/redis-runtime";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function getSecret(): string {
  return process.env.SESSION_SECRET || "CHANGE_THIS_IN_PRODUCTION";
}

function hashRawPassword(password: string): string {
  return createHmac("sha256", getSecret()).update(password).digest("hex");
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD_HASH;
  if (!expected) return false;
  const received = hashRawPassword(password);
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createAdminToken(): string {
  const nonce = randomBytes(24).toString("hex");
  const now = Date.now();
  const payload = `${nonce}:${now}`;
  const signature = createHmac("sha256", getSecret()).update(payload).digest("hex");
  const token = Buffer.from(`${payload}:${signature}`).toString("base64");
  return token;
}

export function validateAdminToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64").toString();
    const [nonce, issuedAtStr, signature] = decoded.split(":");
    if (!nonce || !issuedAtStr || !signature) return false;
    const raw = `${nonce}:${issuedAtStr}`;
    const expected = createHmac("sha256", getSecret()).update(raw).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

    const issuedAt = Number(issuedAtStr);
    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > SESSION_TTL_MS) return false;

    return true;
  } catch {
    return false;
  }
}

function adminSessionKey(token: string): string {
  return `atc:admin:session:${token}`;
}

export async function createAdminSession(token: string): Promise<void> {
  await rtSetEx(adminSessionKey(token), Math.ceil(SESSION_TTL_MS / 1000), "1");
}

export async function isAdminSessionValid(token: string): Promise<boolean> {
  if (!validateAdminToken(token)) return false;
  return rtExists(adminSessionKey(token));
}

export async function destroyAdminToken(token: string): Promise<void> {
  await rtDel(adminSessionKey(token));
}

export async function checkLoginRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const maxAttempts = 5;
  const windowSeconds = 300;
  const key = `atc:admin:login:${ip}`;
  const attempts = await rtIncrWithExpiry(key, windowSeconds);
  return {
    allowed: attempts <= maxAttempts,
    remaining: Math.max(0, maxAttempts - attempts),
  };
}
