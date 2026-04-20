import { rtIncrWithExpiry } from "@/lib/redis-runtime";

/**
 * Rate-limiter basado en Redis.
 *
 * Cada clave tiene un contador en Redis con TTL = windowSeconds.
 * Al superar maxRequests, devuelve `allowed: false`.
 *
 * Ventajas sobre la implementación anterior (Map en memoria):
 * - Persiste entre reinicios de PM2.
 * - Funciona correctamente en múltiples réplicas.
 * - No crece ilimitadamente en RAM.
 */
export async function checkRateLimit(
  key: string,
  options: { maxRequests: number; windowSeconds: number },
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  const count = await rtIncrWithExpiry(key, options.windowSeconds);
  const allowed = count <= options.maxRequests;
  return {
    allowed,
    remaining: Math.max(0, options.maxRequests - count),
    retryAfter: options.windowSeconds,
  };
}
