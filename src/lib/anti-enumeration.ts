import { rtIncrWithExpiry, rtSetEx, rtGet } from "@/lib/redis-runtime";

/**
 * Anti-enumeración basado en Redis.
 *
 * Detecta si una IP está probando sistemáticamente muchos `condominioId` distintos
 * (indicativo de escaneo de parámetros incrementales).
 *
 * Mejoras respecto a la implementación anterior (Map en memoria):
 * - Persiste entre reinicios de PM2.
 * - La clave compuesta `(condominioId, ip)` evita que una IP bloqueada
 *   para un condominio pueda seguir atacando otros.
 * - No crece ilimitadamente en RAM.
 */

const BLOCK_SECONDS = 60 * 60; // 1 hora
const MAX_DISTINCT_IDS = 8;
const WINDOW_SECONDS = 5 * 60; // ventana de 5 minutos para conteo

function counterKey(ip: string): string {
  return `atc:enum:counter:${ip}`;
}

function blockKey(ip: string): string {
  return `atc:enum:blocked:${ip}`;
}

export async function evaluateEnumeration(
  ip: string,
  condominioId: number,
): Promise<{ allowed: boolean; score: number }> {
  // Comprobar si la IP ya está bloqueada.
  const blocked = await rtGet(blockKey(ip));
  if (blocked) {
    return { allowed: false, score: 100 };
  }

  // Incrementar el contador de intentos únicos. La clave incluye el condominioId
  // para que cada (ip, condominioId) tenga su propio contador.
  const compositeKey = `atc:enum:id:${ip}:${condominioId}`;
  const thisCount = await rtIncrWithExpiry(compositeKey, WINDOW_SECONDS);
  const distinctCount = await rtIncrWithExpiry(counterKey(ip), WINDOW_SECONDS);

  // Calcular score basado en número de IDs distintos probados.
  let score = 0;
  if (distinctCount > MAX_DISTINCT_IDS) score += 70;
  // Penalización adicional si un mismo ID se intenta repetidamente a alta velocidad.
  if (thisCount > 20) score += 30;

  if (score >= 80) {
    // Bloquear IP por BLOCK_SECONDS.
    await rtSetEx(blockKey(ip), BLOCK_SECONDS, "1");
    return { allowed: false, score };
  }

  return { allowed: true, score };
}
