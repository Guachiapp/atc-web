import { NextRequest } from "next/server";

/**
 * Extrae la IP del cliente de forma segura, priorizando cabeceras de proxy confiables.
 *
 * IMPORTANTE: guachi-atc-web DEBE desplegarse detrás de un proxy inverso confiable
 * (como Cloudflare o un Nginx bien configurado) que elimine cabeceras spoofed
 * y establezca la IP real.
 *
 * Orden de prioridad:
 * 1. `cf-connecting-ip`: IP real validada por Cloudflare.
 * 2. `x-real-ip`: Usualmente configurada por Nginx (`proxy_set_header X-Real-IP $remote_addr;`).
 * 3. `x-forwarded-for`: Primer valor de la lista (vulnerable a IP spoofing si no hay proxy).
 */
export function getClientIp(request: NextRequest): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Tomar solo la primera IP de la cadena XFF (la más alejada, el cliente original).
    return forwarded.split(",")[0].trim();
  }

  return "unknown";
}

/**
 * Retorna un hash truncado de la IP para logs (anonimización PII).
 */
export function hashIp(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";
  // Import dinámico de crypto para evitar problemas en edge runtime si fuera necesario, 
  // pero Next.js ya provee crypto global o compatible.
  const { createHash } = require("crypto");
  return createHash("sha256").update(ip).digest("hex").slice(0, 8);
}
