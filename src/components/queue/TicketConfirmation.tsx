"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  Bell,
  CheckCircle2,
  Radio,
  Sparkles,
  Users,
  Volume2,
} from "lucide-react";
import { GuachiLogo } from "@/components/brand/GuachiLogo";
import { useQueueTicketStream } from "@/hooks/use-queue-ticket-stream";
import {
  requestTicketNotificationsPermission,
  useTicketCallNotifications,
} from "@/hooks/use-ticket-call-notifications";
import type {
  DeviceFingerprint,
  QueueRedisNotification,
  QueueStatus,
  QueueTicket,
} from "@/types/queue";

const REDIRECT_HOME_AFTER_ATENDIDO_MS = 4000;

interface TicketConfirmationProps {
  ticket: QueueTicket;
  queueSessionToken: string;
  userIdEmpresa: number;
  userRolIdEmpresa: number;
  empresaNombre?: string;
  empresaUbicacion?: string;
  /** Huella del dispositivo; necesaria para liberar la asociación en servidor al terminar. */
  device: DeviceFingerprint | null;
}

function formatHorario(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function TicketConfirmation({
  ticket,
  queueSessionToken,
  userIdEmpresa,
  userRolIdEmpresa,
  empresaNombre,
  empresaUbicacion,
  device,
}: TicketConfirmationProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const releasedAssociationRef = useRef(false);
  const [status, setStatus] = useState<QueueStatus>({
    estado: ticket.estado,
    mensaje: "Tu turno está en cola",
    updatedAt: new Date().toISOString(),
  });
  const [pollError, setPollError] = useState("");
  const [ticketLive, setTicketLive] = useState(false);
  const [datosListos, setDatosListos] = useState(false);
  const [puestoHint, setPuestoHint] = useState<string | null>(null);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );

  const empresaLine = [empresaNombre, empresaUbicacion].filter(Boolean).join(" · ");

  const pollStatus = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        queueSessionToken,
        userIdEmpresa: String(userIdEmpresa),
        userRolIdEmpresa: String(userRolIdEmpresa),
      });
      const res = await fetch(`/api/queue/status/${ticket.uuid}?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: QueueStatus;
        error?: string;
        code?: string;
        hint?: string;
      };
      if (json.success && json.data) {
        setPollError("");
        setStatus(json.data);
        setDatosListos(true);
        return;
      }
      const msg = [json.error, json.hint].filter(Boolean).join(" — ") || `Error ${res.status}`;
      setPollError(msg);
      if (res.status !== 403) {
        console.warn("[TicketConfirmation] poll no ok", res.status, json);
      }
    } catch (error) {
      console.error("[TicketConfirmation] poll error", error);
      setPollError("No se pudo actualizar el estado. Revisa la conexión.");
    }
  }, [ticket.uuid, queueSessionToken, userIdEmpresa, userRolIdEmpresa]);

  const onStreamPayload = useCallback(
    (payload: QueueRedisNotification) => {
      const tipo = String(payload.type || "").toUpperCase();
      if (payload.uuid === ticket.uuid && tipo === "LLAMADO") {
        if (payload.puesto != null && String(payload.puesto).trim() !== "") {
          setPuestoHint(String(payload.puesto).trim());
        }
      }
      void pollStatus();
    },
    [pollStatus, ticket.uuid],
  );

  useQueueTicketStream(
    {
      queueSessionToken,
      userIdEmpresa,
      userRolIdEmpresa,
      enabled: queueSessionToken.length > 0,
    },
    onStreamPayload,
    {
      onOpen: () => setTicketLive(true),
      onConnectionLost: () => setTicketLive(false),
    },
  );

  useTicketCallNotifications({
    estado: status.estado,
    ticketNumero: ticket.numero,
    empresaLine: empresaLine || undefined,
    puestoLabel: puestoHint,
    datosListos,
  });

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotifPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active) return;
      await pollStatus();
    };

    void poll();
    const id = setInterval(poll, ticketLive ? 25000 : 12000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pollStatus, ticketLive]);

  /** Liberar Redis en cuanto el estado es atendido (mientras la sesión sigue válida), no al redirigir. */
  useEffect(() => {
    if (status.estado !== "atendido" || !device || releasedAssociationRef.current) return;
    releasedAssociationRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/queue/device/ticket/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queueSessionToken,
            userIdEmpresa,
            ticketUuid: ticket.uuid,
            device,
          }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null;
          console.warn("[TicketConfirmation] clear device association", res.status, json?.error);
        }
      } catch (err) {
        console.warn("[TicketConfirmation] clear device association failed", err);
      }
    })();
  }, [status.estado, device, queueSessionToken, userIdEmpresa, ticket.uuid]);

  useEffect(() => {
    if (status.estado !== "atendido") return;
    const t = window.setTimeout(() => {
      router.push("/");
    }, REDIRECT_HOME_AFTER_ATENDIDO_MS);
    return () => window.clearTimeout(t);
  }, [status.estado, router]);

  const cola = status.cola;
  const esLlamado = status.estado === "llamado";
  const esAtendido = status.estado === "atendido";
  const esPendiente = status.estado === "pendiente";

  const handleActivarNotificaciones = async () => {
    setNotifBusy(true);
    try {
      const p = await requestTicketNotificationsPermission();
      setNotifPermission(p);
    } finally {
      setNotifBusy(false);
    }
  };

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 26, stiffness: 260 }}
      className="w-full max-w-lg"
      aria-live="polite"
    >
      <div className="mb-6 flex justify-center">
        <GuachiLogo variant="white" width={168} height={42} />
      </div>

      {empresaLine ? (
        <p className="mb-6 text-center text-sm text-slate-400">{empresaLine}</p>
      ) : null}

      {/* —— Estado: te están llamando —— */}
      {esLlamado ? (
        <motion.div
          initial={reduceMotion ? false : { scale: 0.98, opacity: 0.9 }}
          animate={reduceMotion ? undefined : { scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
          className="relative mb-6 overflow-hidden rounded-3xl border border-sa-primary/50 bg-linear-to-b from-sa-primary/25 via-sa-primary/15 to-[#0d1520] p-8 text-center shadow-[0_0_60px_-12px_rgba(91,135,218,0.55)]"
        >
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sa-primary blur-3xl" />
            <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-sa-primary-light/30 blur-2xl" />
          </div>
          <div className="relative">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sa-primary/40 bg-sa-primary/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sa-primary-light">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Turno en llamado
            </div>
            <h2 className="mb-2 text-2xl font-bold text-white md:text-3xl">¡Te están llamando!</h2>
            <p className="mb-6 text-base text-slate-200">
              Acercate a taquilla con tu número listo. Si no escuchaste el altavoz, mostrá esta pantalla.
            </p>
            <motion.p
              animate={reduceMotion ? undefined : { scale: [1, 1.06, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6 }}
              className="font-mono text-7xl font-bold text-white drop-shadow-lg md:text-8xl"
            >
              {ticket.numero}
            </motion.p>
            {puestoHint ? (
              <p className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-black/25 px-5 py-3 text-lg font-semibold text-sa-primary-light">
                <Radio className="h-5 w-5 shrink-0" aria-hidden />
                Puesto {puestoHint}
              </p>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                El puesto puede aparecer aquí cuando el sistema lo envía en tiempo real.
              </p>
            )}
          </div>
        </motion.div>
      ) : (
        <>
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.05] p-6 text-center backdrop-blur-[12px]">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tu número
            </p>
            <motion.p
              animate={reduceMotion ? undefined : { scale: [1, 1.03, 1] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1.2 }}
              className="font-mono text-6xl font-bold text-sa-primary-light md:text-7xl"
            >
              {ticket.numero}
            </motion.p>
            <p className="mt-3 text-sm text-slate-400">
              Actualizado {formatHorario(status.updatedAt)}
              {ticketLive ? (
                <span className="ml-2 inline-flex items-center gap-1 text-sa-primary-light/90">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sa-primary opacity-50" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-sa-primary-light" />
                  </span>
                  En vivo
                </span>
              ) : null}
            </p>
          </div>

          {esAtendido ? (
            <div className="mb-6 rounded-2xl border border-sa-state-success/35 bg-sa-state-success/10 p-6 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-sa-state-success" aria-hidden />
              <h3 className="text-xl font-semibold text-white">Atención completada</h3>
              <p className="mt-2 text-sm text-slate-300">Gracias por usar el turno digital Guachi.</p>
              <p className="mt-4 text-sm font-medium text-sa-primary-light">
                Te llevamos al inicio en unos segundos para que puedas tomar un nuevo turno cuando lo
                necesites.
              </p>
            </div>
          ) : null}
        </>
      )}

      {/* —— Panel informativo: cola (esperando) —— */}
      {!esLlamado && !esAtendido && cola && esPendiente ? (
        <div className="mb-6 space-y-4 rounded-2xl border border-white/12 bg-sa-secondary-dark/50 p-5 backdrop-blur-[12px]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-sa-primary/20 p-2 text-sa-primary-light">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white">Tu lugar en la fila</h3>
              <p className="mt-1 text-sm text-slate-300">
                {cola.personasAntes === 0 ? (
                  <>
                    No hay nadie delante de vos en espera: <strong className="text-white">sos el siguiente</strong>{" "}
                    en cuanto liberen un puesto.
                  </>
                ) : (
                  <>
                    Hay <strong className="text-white">{cola.personasAntes}</strong>{" "}
                    {cola.personasAntes === 1 ? "persona" : "personas"} antes que vos. Tu posición:{" "}
                    <strong className="text-white">#{cola.posicionEnFila}</strong> de {cola.totalEnEspera} en espera.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Radio className="h-3.5 w-3.5" aria-hidden />
              En taquilla ahora
            </p>
            {cola.numerosEnLlamado.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="Números llamados en este momento">
                {cola.numerosEnLlamado.map((n) => (
                  <li
                    key={n}
                    className="rounded-lg border border-sa-primary/40 bg-sa-primary/15 px-3 py-1.5 font-mono text-sm font-semibold text-sa-primary-light"
                  >
                    #{n}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Nadie en llamado en este momento.</p>
            )}
          </div>

          <p className="border-t border-white/10 pt-3 text-center text-xs text-slate-500">
            Total en espera en esta taquilla: <strong className="text-slate-300">{cola.totalEnEspera}</strong>
          </p>
        </div>
      ) : null}

      {/* —— Resumen compacto si ya fue llamado o atendido (contexto cola opcional) —— */}
      {esLlamado && cola ? (
        <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-center text-sm text-slate-400">
          {cola.totalEnEspera > 0 ? (
            <p>
              Otras <strong className="text-slate-200">{cola.totalEnEspera}</strong> personas siguen en espera.
            </p>
          ) : (
            <p>No hay más turnos en espera.</p>
          )}
        </div>
      ) : null}

      {/* —— Estado textual —— */}
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado del turno</p>
        <p className="mt-1 text-lg font-semibold capitalize text-white">{status.estado}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">{status.mensaje}</p>
        {pollError ? (
          <p className="mt-3 border-t border-white/10 pt-3 text-sm text-sa-state-error">{pollError}</p>
        ) : null}
      </div>

      {/* —— Avisos del navegador (no reemplaza push con app cerrada) —— */}
      {typeof Notification !== "undefined" && notifPermission === "default" ? (
        <div className="mt-5 rounded-2xl border border-white/15 bg-white/[0.06] p-4">
          <div className="flex gap-3">
            <div className="shrink-0 rounded-lg bg-sa-primary/20 p-2 text-sa-primary-light">
              <Bell className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white">Aviso cuando te llamen</p>
              <p className="mt-1 text-sm text-slate-400">
                Si cambiás de app o apagás la pantalla, el navegador puede mostrar un aviso cuando te llamen.{" "}
                <span className="text-slate-500">
                  (No es notificación push con la página cerrada; en iOS puede requerir añadir el sitio a inicio.)
                </span>
              </p>
              <button
                type="button"
                disabled={notifBusy}
                onClick={() => void handleActivarNotificaciones()}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sa-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-sa-primary-dark disabled:opacity-50"
              >
                <Volume2 className="h-4 w-4" aria-hidden />
                {notifBusy ? "Abriendo permisos…" : "Activar avisos del navegador"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {typeof Notification !== "undefined" && notifPermission === "granted" ? (
        <p className="mt-4 text-center text-xs text-slate-500">
          <Bell className="mr-1 inline h-3.5 w-3.5 text-sa-state-success" aria-hidden />
          Avisos del navegador activados para cuando te llamen.
        </p>
      ) : null}

      {typeof Notification !== "undefined" && notifPermission === "denied" ? (
        <p className="mt-4 text-center text-xs text-slate-500">
          Los avisos del navegador están bloqueados. Podés habilitarlos en la configuración del sitio en tu navegador.
        </p>
      ) : null}
    </motion.section>
  );
}
