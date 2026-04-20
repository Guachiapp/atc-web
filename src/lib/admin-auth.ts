import { randomBytes, timingSafeEqual } from "crypto";
import * as argon2 from "argon2";
import { rtDel, rtExists, rtIncrWithExpiry, rtSetEx } from "@/lib/redis-runtime";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Devuelve el secreto de firma de tokens de sesión admin.
 * Separado del hash de contraseña: argon2 genera su propio salt internamente.
 * En producción, SESSION_SECRET debe estar definida (ver src/lib/env.ts).
 */
function getSessionSigningSecret(): string {
  return process.env.SESSION_SECRET ?? "CHANGE_THIS_IN_PRODUCTION";
}

/**
 * Verifica la contraseña del administrador contra el hash almacenado en ADMIN_PASSWORD_HASH.
 *
 * El hash debe haber sido generado con argon2id:
 *   node -e "require('argon2').hash('tu-contraseña', { type: require('argon2').argon2id }).then(console.log)"
 *
 * Compatibilidad: también acepta hashes argon2i y argon2d (argon2.verify los detecta por el prefijo).
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const storedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!storedHash) return false;

  // argon2 hashes comienzan con "$argon2...". Si el valor almacenado no lo tiene,
  // es un hash legacy (HMAC-SHA256) que ya no se acepta.
  if (!storedHash.startsWith("$argon2")) {
    console.error(
      "[admin-auth] ADMIN_PASSWORD_HASH contiene un hash en formato legacy (HMAC). " +
        "Regenera el hash con argon2id. Ver src/lib/admin-auth.ts para instrucciones.",
    );
    return false;
  }

  try {
    return await argon2.verify(storedHash, password);
  } catch {
    return false;
  }
}

export function createAdminToken(): string {
  const nonce = randomBytes(24).toString("hex");
  const now = Date.now();
  const payload = `${nonce}:${now}`;
  const { createHmac } = require("crypto") as typeof import("crypto");
  const signature = createHmac("sha256", getSessionSigningSecret()).update(payload).digest("hex");
  const token = Buffer.from(`${payload}:${signature}`).toString("base64");
  return token;
}

export function validateAdminToken(token: string): boolean {
  try {
    const { createHmac } = require("crypto") as typeof import("crypto");
    const decoded = Buffer.from(token, "base64").toString();
    const [nonce, issuedAtStr, signature] = decoded.split(":");
    if (!nonce || !issuedAtStr || !signature) return false;
    const raw = `${nonce}:${issuedAtStr}`;
    const expected = createHmac("sha256", getSessionSigningSecret()).update(raw).digest("hex");
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
