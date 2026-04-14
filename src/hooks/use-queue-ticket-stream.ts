"use client";

import { useEffect, useRef } from "react";
import type { QueueRedisNotification } from "@/types/queue";

type StreamEnvelope =
  | { channel: "queue"; payload: QueueRedisNotification }
  | { channel: "queue"; raw: string }
  | { channel: "system"; type: string; [key: string]: unknown };

/** Espera base antes del primer reintento (ms). */
const BACKOFF_BASE_MS = 1000;
/** Tope superior del backoff exponencial (ms). */
const BACKOFF_MAX_MS = 60_000;
/** Jitter multiplicador [0.85, 1.15] para evitar reconexiones sincronizadas. */
function jitterMs(ms: number): number {
  return Math.round(ms * (0.85 + Math.random() * 0.3));
}

function backoffDelayMs(attemptAfterFailure: number): number {
  const exp = Math.min(attemptAfterFailure, 20);
  const raw = BACKOFF_BASE_MS * 2 ** exp;
  return jitterMs(Math.min(BACKOFF_MAX_MS, raw));
}

/**
 * SSE hacia `/api/queue/stream`: recibe publicaciones Redis `tickets_{userRolIdEmpresa}`.
 * Reconexión automática con backoff exponencial ante cortes de red o reinicios del servidor;
 * transparente para el usuario (no se notifica cada fallo transitorio).
 *
 * - `onOpen`: se llama cada vez que la conexión queda abierta (incluido tras un reintento exitoso).
 * - `onConnectionLost`: solo al desmontar o cuando `enabled` pasa a false (fin del ciclo de vida).
 */
export function useQueueTicketStream(
  params: {
    queueSessionToken: string;
    userIdEmpresa: number;
    userRolIdEmpresa: number;
    enabled: boolean;
  },
  onQueuePayload: (payload: QueueRedisNotification) => void,
  options?: {
    onOpen?: () => void;
    onConnectionLost?: () => void;
  },
): void {
  const onPayloadRef = useRef(onQueuePayload);
  const optsRef = useRef(options);
  onPayloadRef.current = onQueuePayload;
  optsRef.current = options;

  useEffect(() => {
    if (!params.enabled || !params.queueSessionToken) return;

    const qs = new URLSearchParams({
      queueSessionToken: params.queueSessionToken,
      userIdEmpresa: String(params.userIdEmpresa),
      userRolIdEmpresa: String(params.userRolIdEmpresa),
    });
    const url = `/api/queue/stream?${qs.toString()}`;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: EventSource | null = null;
    /** Número de fallos consecutivos desde la última apertura exitosa (para backoff). */
    let failureCount = 0;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const teardownEventSource = () => {
      if (!eventSource) return;
      eventSource.removeEventListener("message", onMessage as EventListener);
      eventSource.close();
      eventSource = null;
    };

    function onMessage(e: MessageEvent<string>) {
      try {
        const data = JSON.parse(e.data) as StreamEnvelope;
        if (data.channel !== "queue") return;
        if ("payload" in data && data.payload && typeof data.payload === "object") {
          onPayloadRef.current(data.payload as QueueRedisNotification);
        }
      } catch {
        /* ignore malformed frames */
      }
    }

    const scheduleReconnect = () => {
      if (cancelled) return;
      clearReconnectTimer();
      // Tras el fallo N, usar índice N-1 para que el primer reintento sea ~1 s (2^0·base).
      const delay = backoffDelayMs(Math.max(0, failureCount - 1));
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!cancelled) openConnection();
      }, delay);
    };

    const openConnection = () => {
      if (cancelled) return;
      clearReconnectTimer();
      teardownEventSource();

      const es = new EventSource(url);
      eventSource = es;

      es.addEventListener("message", onMessage as EventListener);

      es.addEventListener("open", () => {
        if (cancelled) return;
        failureCount = 0;
        optsRef.current?.onOpen?.();
      });

      // Un evento por instancia; evita reentradas si el runtime dispara `error` varias veces.
      es.addEventListener(
        "error",
        () => {
          if (cancelled) return;
          teardownEventSource();
          failureCount += 1;
          scheduleReconnect();
        },
        { once: true },
      );
    };

    openConnection();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      teardownEventSource();
      optsRef.current?.onConnectionLost?.();
    };
  }, [params.enabled, params.queueSessionToken, params.userIdEmpresa, params.userRolIdEmpresa]);
}
