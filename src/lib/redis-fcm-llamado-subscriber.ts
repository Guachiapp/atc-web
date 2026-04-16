import type Redis from "ioredis";
import { sendFcmToTokens, isFcmConfigured } from "@/lib/fcm-admin";
import { collectFcmTokensForTicket } from "@/lib/push-token-store";
import { createQueueTicketSubscriber, isRedisConfigured, rtSetNxEx } from "@/lib/redis-runtime";

const CHANNEL_PATTERN = "tickets_*";

/** Evita reenvíos si el mismo llamado se publica varias veces o hay varias réplicas PM2 (TTL corto, solo dedupe). */
const DEDUPE_TTL_SECONDS = 120;

type RedisLlamadoPayload = {
  type?: unknown;
  uuid?: unknown;
  numero?: unknown;
  puesto?: unknown;
};

function parsePayload(raw: string): RedisLlamadoPayload | null {
  try {
    return JSON.parse(raw) as RedisLlamadoPayload;
  } catch {
    return null;
  }
}

async function handleTicketsChannelMessage(channel: string, raw: string): Promise<void> {
  if (!channel.startsWith("tickets_")) return;

  const payload = parsePayload(raw);
  if (!payload) return;

  const tipo = String(payload.type ?? "").toUpperCase();
  if (tipo !== "LLAMADO") return;

  const uuid = typeof payload.uuid === "string" ? payload.uuid.trim() : "";
  if (!uuid) return;

  if (!isFcmConfigured()) return;

  const lockKey = `atc:push:dedupe:llamado:${uuid}`;
  const acquired = await rtSetNxEx(lockKey, DEDUPE_TTL_SECONDS, "1");
  if (!acquired) return;

  const tokens = await collectFcmTokensForTicket(uuid);
  if (tokens.length === 0) return;

  const numero =
    typeof payload.numero === "number"
      ? payload.numero
      : Number.parseInt(String(payload.numero ?? ""), 10);
  const numeroLabel = Number.isFinite(numero) ? String(numero) : "?";
  const puestoRaw = payload.puesto != null ? String(payload.puesto).trim() : "";
  const title = "¡Te están llamando!";
  const body = puestoRaw
    ? `Turno ${numeroLabel} · Puesto ${puestoRaw}`
    : `Turno ${numeroLabel}`;

  const data: Record<string, string> = {
    type: "LLAMADO",
    uuid,
    numero: numeroLabel,
  };
  if (puestoRaw) data.puesto = puestoRaw;

  const result = await sendFcmToTokens(tokens, { title, body }, data);
  if (result.failure > 0) {
    console.warn("[redis-fcm-llamado] FCM partial failure", { uuid, ...result });
  } else {
    console.info("[redis-fcm-llamado] FCM sent", { uuid, tokens: tokens.length, ...result });
  }
}

const globalForSub = globalThis as unknown as {
  __atcRedisFcmLlamadoSubscriber?: { client: Redis | null };
};

export function startRedisFcmLlamadoSubscriber(): void {
  if (globalForSub.__atcRedisFcmLlamadoSubscriber?.client) return;

  if (process.env.ENABLE_REDIS_FCM_LLAMADO_SUBSCRIBER === "0") {
    console.info("[redis-fcm-llamado] disabled via ENABLE_REDIS_FCM_LLAMADO_SUBSCRIBER=0");
    return;
  }

  if (!isRedisConfigured()) {
    console.warn("[redis-fcm-llamado] REDIS_URL not set; subscriber not started");
    return;
  }

  if (!isFcmConfigured()) {
    console.warn("[redis-fcm-llamado] FIREBASE_SERVICE_ACCOUNT_JSON not set; subscriber not started");
    return;
  }

  const sub = createQueueTicketSubscriber();
  if (!sub) {
    console.error("[redis-fcm-llamado] could not create Redis duplicate client");
    return;
  }

  globalForSub.__atcRedisFcmLlamadoSubscriber = { client: sub };

  const onPMessage = (_pattern: string, channel: string, message: string) => {
    void handleTicketsChannelMessage(channel, message).catch((e) => {
      console.error("[redis-fcm-llamado] handleTicketsChannelMessage", e);
    });
  };

  sub.on("pmessage", onPMessage);
  sub.on("error", (err) => {
    console.error("[redis-fcm-llamado] redis connection error", err);
  });

  void (async () => {
    try {
      if (sub.status === "wait" || sub.status === "connecting" || sub.status === "reconnecting") {
        await sub.connect();
      }
      await sub.psubscribe(CHANNEL_PATTERN);
      console.info(`[redis-fcm-llamado] psubscribed ${CHANNEL_PATTERN}`);
    } catch (e) {
      console.error("[redis-fcm-llamado] psubscribe failed", e);
      void sub.quit().catch(() => {});
      globalForSub.__atcRedisFcmLlamadoSubscriber = { client: null };
    }
  })();

  const shutdown = () => {
    try {
      sub.removeAllListeners("pmessage");
      void sub.punsubscribe(CHANNEL_PATTERN).catch(() => {});
      void sub.quit().catch(() => {});
    } catch {
      /* noop */
    }
    globalForSub.__atcRedisFcmLlamadoSubscriber = { client: null };
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
