import { NextRequest, NextResponse } from "next/server";
import { getSecurityHeaders } from "./src/lib/security-headers";
import { checkRateLimit } from "./src/lib/rate-limiter";

/**
 * Extrae la IP del cliente priorizando cabeceras de proxy confiables.
 *
 * Orden de prioridad:
 * 1. `cf-connecting-ip` — IP real del cliente detrás de Cloudflare.
 * 2. `x-real-ip`        — Seteada por Nginx con `proxy_set_header X-Real-IP $remote_addr;`.
 * 3. `x-forwarded-for`  — Primer valor (puede ser falsificado si no hay proxy confiable).
 *
 * IMPORTANTE: documenta en README que la app debe desplegarse detrás de Nginx o Cloudflare
 * y que dichos proxies deben setear X-Real-IP o usar Cloudflare para que la IP sea confiable.
 */
function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function proxy(request: NextRequest) {
  // Generar un nonce criptográfico único por request para la Content-Security-Policy.
  // El nonce se comparte con los Server Components vía el header x-nonce.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });

  // Adjuntar el nonce para que los Server Components puedan leerlo con headers().get('x-nonce').
  response.headers.set("x-nonce", nonce);

  // Aplicar cabeceras de seguridad (CSP con nonce incluido, HSTS, etc.).
  const securityHeaders = getSecurityHeaders(nonce);
  Object.entries(securityHeaders).forEach(([key, value]) => response.headers.set(key, value));

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const ip = clientIp(request);
    const isSensitive =
      request.nextUrl.pathname.includes("/queue/generar-ticket") ||
      request.nextUrl.pathname.includes("/admin/auth/login");
    const result = checkRateLimit(`mw:${ip}:${isSensitive ? "s" : "n"}`, {
      maxRequests: isSensitive ? 30 : 120,
      windowSeconds: 60,
    });
    if (!result.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(result.retryAfter) } },
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
