import { sendFcmToTokens, isFcmConfigured } from "@/lib/fcm-admin";
import { getQueueStatusForTicket } from "@/lib/queue-status-adapter";
import {
  collectFcmTokensForTicket,
  getPushRegistrationContextForTicket,
  listTicketUuidsWithPushIndex,
} from "@/lib/push-token-store";
import { rtSetNxEx } from "@/lib/redis-runtime";

/** No ejecutar más de una pasada completa por canal cada N segundos (Centinela + SCAN). */
const DEBOUNCE_SECONDS = 3;
/** Un aviso "casi tu turno" por ticket por ventana de tiempo. */
const DEDUPE_NOTIFY_TTL_SECONDS = 24 * 60 * 60;

function thresholdPersonasAntes(): number {
  const n = Number.parseInt(process.env.PUSH_COLA_PERSONAS_ANTES?.trim() ?? "5", 10);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

/** Canal Redis `tickets_{user_rol_id_empresa}` → id numérico. */
export function parseUserRolIdEmpresaFromTicketsChannel(channel: string): number | null {
  const m = /^tickets_(\d+)$/.exec(channel.trim());
  if (!m) return null;
  return Number.parseInt(m[1], 10);
}

/**
 * Tras cualquier evento en el canal de una ventanilla, reevalúa turnos con push registrado:
 * si el turno sigue `pendiente` y `cola.personasAntes` coincide con el umbral (p. ej. 5), envía FCM.
 */
export async function runCasiTuTurnoCheckForVentanilla(userRolIdEmpresa: number): Promise<void> {
  if (process.env.ENABLE_REDIS_FCM_CASI_TURNO === "0") return;
  if (!isFcmConfigured()) return;

  const debounceKey = `atc:push:debounce:casi5:${userRolIdEmpresa}`;
  const acquired = await rtSetNxEx(debounceKey, DEBOUNCE_SECONDS, "1");
  if (!acquired) return;

  const threshold = thresholdPersonasAntes();
  let uuids: string[];
  try {
    uuids = await listTicketUuidsWithPushIndex();
  } catch (e) {
    console.error("[redis-fcm-casi5] listTicketUuidsWithPushIndex", e);
    return;
  }

  for (const ticketUuid of uuids) {
    try {
      const ctx = await getPushRegistrationContextForTicket(ticketUuid);
      if (!ctx || ctx.userRolIdEmpresa !== userRolIdEmpresa) continue;

      const status = await getQueueStatusForTicket({
        ticketUuid,
        userEmpresaId: ctx.userEmpresaId,
        userEmpresaRolId: ctx.userRolIdEmpresa,
      });

      if (status.estado !== "pendiente") continue;
      const pa = status.cola?.personasAntes;
      if (pa !== threshold) continue;

      const dedupeKey = `atc:push:dedupe:casi5:${ticketUuid}`;
      const firstTime = await rtSetNxEx(dedupeKey, DEDUPE_NOTIFY_TTL_SECONDS, "1");
      if (!firstTime) continue;

      const tokens = await collectFcmTokensForTicket(ticketUuid);
      if (tokens.length === 0) continue;

      const title = "Te quedan pocos turnos";
      const body =
        threshold === 1
          ? "Hay 1 persona delante de ti. Prepárate, te llamarán pronto."
          : `Hay ${threshold} personas delante de ti en la fila.`;

      const result = await sendFcmToTokens(
        tokens,
        { title, body },
        {
          type: "CASI_TU_TURNO",
          uuid: ticketUuid,
          personasAntes: String(threshold),
        },
      );
      if (result.failure > 0) {
        console.warn("[redis-fcm-casi5] FCM partial failure", { ticketUuid, ...result });
      } else {
        console.info("[redis-fcm-casi5] FCM sent", {
          ticketUuid,
          userRolIdEmpresa,
          personasAntes: threshold,
          tokens: tokens.length,
        });
      }
    } catch (e) {
      console.warn("[redis-fcm-casi5] skip ticket", ticketUuid, e);
    }
  }
}
