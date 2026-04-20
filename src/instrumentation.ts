/**
 * Arranque del servidor Node: suscriptor Redis único por proceso para FCM en eventos LLAMADO.
 * No ejecutar en Edge. En despliegues serverless (p. ej. una función por request), desactivar con
 * ENABLE_REDIS_FCM_LLAMADO_SUBSCRIBER=0 y usar un worker dedicado.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;

  // Fail-fast: abortar arranque si faltan variables de entorno críticas de seguridad.
  const { validateEnv } = await import("@/lib/env");
  validateEnv();

  const { startRedisFcmLlamadoSubscriber } = await import("@/lib/redis-fcm-llamado-subscriber");
  startRedisFcmLlamadoSubscriber();
}
