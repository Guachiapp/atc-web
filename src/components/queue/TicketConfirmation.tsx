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
} from "lucide-react";
import { GuachiLogo } from "@/components/brand/GuachiLogo";
import { TicketNotificationPromptModal } from "@/components/queue/TicketNotificationPromptModal";
import { QueueSnapshotMetrics } from "@/components/queue/QueueSnapshotMetrics";
import { useQueueTicketStream } from "@/hooks/use-queue-ticket-stream";
import { useFcmWebPush } from "@/hooks/use-fcm-web-push";
import {
  requestTicketNotificationsPermission,
  useTicketCallNotifications,
} from "@/hooks/use-ticket-call-notifications";
import { isFcmWebPushConfigured } from "@/lib/firebase-web-config";
import {
  recordNotifPromptGranted,
  recordNotifPromptSnoozed,
  shouldShowNotificationPromptModal,
} from "@/lib/atc-notif-prompt-storage";
import type {
  DeviceFingerprint,
  QueueRedisNotification,
  QueueSnapshot,
  QueueStatus,
  QueueTicket,
} from "@/types/queue";

const REDIRECT_HOME_AFTER_ATENDIDO_MS = 4000;

/** Evento INFO del pub/sub Redis cuando ya no quedan turnos por atender (p. ej. cierre de cola). */
function isInfoColaSinPendientes(info: string | undefined): boolean {
  if (!info || typeof info !== "string") return false;
  return info.trim().toLowerCase().includes("no hay números sin atender");
}

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
  const releasedFcmRef = useRef(false);

  const fcmPush = useFcmWebPush({
    queueSessionToken,
    userIdEmpresa,
    userRolIdEmpresa,
    ticketUuid: ticket.uuid,
    installId: device?.installId,
  });
  const [status, setStatus] = useState<QueueStatus>({
    estado: ticket.estado,
    mensaje: "Tu turno está en la fila",
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
  const [queueSnapshot, setQueueSnapshot] = useState<QueueSnapshot | null>(null);
  const [queueSnapshotLoading, setQueueSnapshotLoading] = useState(true);
  const [queueSnapshotError, setQueueSnapshotError] = useState("");
  const [notifModalOpen, setNotifModalOpen] = useState(false);

  const empresaLine = [empresaNombre, empresaUbicacion].filter(Boolean).join(" · ");

  const loadQueueSnapshot = useCallback(async () => {
    if (!queueSessionToken) return;
    try {
      setQueueSnapshotError("");
      const params = new URLSearchParams({
        queueSessionToken,
        userIdEmpresa: String(userIdEmpresa),
        userRolIdEmpresa: String(userRolIdEmpresa),
        limit: "20",
      });
      const res = await fetch(`/api/queue/info?${params.toString()}`);
      const json = (await res.json()) as { success?: boolean; data?: QueueSnapshot; error?: string };
      if (!json.success || !json.data) {
        throw new Error(json.error || "No se pudo cargar la cola");
      }
      setQueueSnapshot(json.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo cargar la cola";
      setQueueSnapshot((prev) => {
        if (!prev) setQueueSnapshotError(msg);
        else console.warn("[TicketConfirmation] snapshot refresh failed", msg);
        return prev;
      });
    } finally {
      setQueueSnapshotLoading(false);
    }
  }, [queueSessionToken, userIdEmpresa, userRolIdEmpresa]);

  const pollStatus = useCallback(async (): Promise<QueueStatus | null> => {
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
        return json.data;
      }
      const msg = [json.error, json.hint].filter(Boolean).join(" — ") || `Error ${res.status}`;
      setPollError(msg);
      if (res.status !== 403) {
        console.warn("[TicketConfirmation] poll no ok", res.status, json);
      }
      return null;
    } catch (error) {
      console.error("[TicketConfirmation] poll error", error);
      setPollError("No se pudo actualizar el estado. Revisa la conexión.");
      return null;
    }
  }, [ticket.uuid, queueSessionToken, userIdEmpresa, userRolIdEmpresa]);

  const onStreamPayload = useCallback(
    async (payload: QueueRedisNotification) => {
      const tipo = String(payload.type || "").toUpperCase();
      if (payload.uuid === ticket.uuid && tipo === "LLAMADO") {
        if (payload.puesto != null && String(payload.puesto).trim() !== "") {
          setPuestoHint(String(payload.puesto).trim());
        }
      }

      const latest = await pollStatus();
      await loadQueueSnapshot();

      /**
       * INFO "No hay números sin atender": si el cliente seguía en llamado (en ventanilla),
       * el backend puede no haber persistido aún `atendido`; alineamos UI y efectos (clear, FCM, redirect).
       */
      if (
        tipo === "INFO" &&
        isInfoColaSinPendientes(payload.info) &&
        latest?.estado === "llamado"
      ) {
        setStatus((s) =>
          s.estado === "llamado"
            ? {
                ...s,
                estado: "atendido",
                mensaje: "Tu atención ha finalizado. Gracias por tu visita.",
                updatedAt: new Date().toISOString(),
              }
            : s,
        );
      }
    },
    [pollStatus, loadQueueSnapshot, ticket.uuid],
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

  /** Modal al tomar turno: permisos visibles sin depender del scroll (móvil). */
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (!shouldShowNotificationPromptModal()) return;
    const t = window.setTimeout(() => setNotifModalOpen(true), 450);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      if (!active) return;
      await pollStatus();
      await loadQueueSnapshot();
    };

    void tick();
    const id = setInterval(tick, ticketLive ? 25000 : 12000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pollStatus, loadQueueSnapshot, ticketLive]);

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
    if (status.estado !== "atendido" || releasedFcmRef.current) return;
    releasedFcmRef.current = true;
    void fcmPush.unregister();
  }, [status.estado, fcmPush.unregister]);

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

  const runNotifPermissionAndFcm = useCallback(async () => {
    const p = await requestTicketNotificationsPermission();
    setNotifPermission(p);
    if (p === "granted" && isFcmWebPushConfigured() && device?.installId) {
      await fcmPush.register();
    }
    return p;
  }, [device?.installId, fcmPush]);

  const handleModalActivateNotificaciones = async () => {
    setNotifBusy(true);
    try {
      const p = await runNotifPermissionAndFcm();
      if (p === "granted") {
        recordNotifPromptGranted();
      } else {
        recordNotifPromptSnoozed(7);
      }
      setNotifModalOpen(false);
    } finally {
      setNotifBusy(false);
    }
  };

  const handleModalDismissNotificaciones = () => {
    recordNotifPromptSnoozed(14);
    setNotifModalOpen(false);
  };

  const handleActivarPushSegundoPlano = async () => {
    setNotifBusy(true);
    try {
      await fcmPush.register();
    } finally {
      setNotifBusy(false);
    }
  };

  const puedeMostrarPushFcm =
    isFcmWebPushConfigured() &&
    Boolean(device?.installId) &&
    !esAtendido &&
    fcmPush.state !== "registered" &&
    fcmPush.state !== "registering";

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 26, stiffness: 260 }}
      className="w-full max-w-2xl"
      aria-live="polite"
    >
      <TicketNotificationPromptModal
        open={notifModalOpen}
        busy={notifBusy}
        fcmConfigured={isFcmWebPushConfigured()}
        onActivate={handleModalActivateNotificaciones}
        onDismiss={handleModalDismissNotificaciones}
      />

      <div className="mb-6 flex justify-center">
        <GuachiLogo variant="white" width={168} height={42} />
      </div>

      {empresaLine ? (
        <p className="mb-4 text-center text-sm text-slate-400">{empresaLine}</p>
      ) : null}

      {/* —— Turno del usuario (prioridad visual sobre la cola general) —— */}
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
              Acércate a la ventanilla con tu número a la mano. Si no escuchaste el altavoz, muestra esta
              pantalla.
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
            {esPendiente && cola ? (
              <p className="mt-4 rounded-xl border border-sa-primary/25 bg-sa-primary/10 px-4 py-3 text-center text-sm leading-relaxed text-slate-200">
                {cola.personasAntes === 0 ? (
                  <>
                    Nadie por delante: <strong className="text-white">eres el siguiente</strong> en espera.
                  </>
                ) : (
                  <>
                    <strong className="tabular-nums text-white">{cola.personasAntes}</strong>{" "}
                    {cola.personasAntes === 1 ? "persona por delante" : "personas por delante"} · Lugar{" "}
                    <strong className="text-white">#{cola.posicionEnFila}</strong> de {cola.totalEnEspera} en
                    espera
                  </>
                )}
              </p>
            ) : esPendiente && !cola && datosListos ? (
              <p className="mt-4 text-center text-xs text-slate-500">
                Sincronizando tu lugar en la fila…
              </p>
            ) : null}
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

      {/* —— Cola general de la ventanilla (GET /api/queue/info) —— */}
      {queueSnapshotLoading ? (
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
          <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-sa-primary/40 border-t-sa-primary" />
          <p className="text-sm text-slate-400">Cargando estado de la cola…</p>
        </div>
      ) : null}

      {!queueSnapshotLoading && queueSnapshotError ? (
        <div className="mb-6 rounded-2xl border border-sa-state-warning/30 bg-sa-state-warning/10 p-4 text-center text-sm text-slate-200">
          {queueSnapshotError}
        </div>
      ) : null}

      {!queueSnapshotLoading && queueSnapshot && !queueSnapshotError ? (
        <div className="mb-6">
          <QueueSnapshotMetrics
            snapshot={queueSnapshot}
            realtimeConnected={ticketLive}
            title="Cola en la ventanilla"
            descripcion="Los mismos datos que al escanear el código: pendientes, en llamado y atendidos recientes."
          />
        </div>
      ) : null}

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
                    No hay nadie delante de ti en espera: <strong className="text-white">eres el siguiente</strong>{" "}
                    en cuanto quede libre un puesto.
                  </>
                ) : (
                  <>
                    Hay <strong className="text-white">{cola.personasAntes}</strong>{" "}
                    {cola.personasAntes === 1 ? "persona" : "personas"} delante de ti. Tu posición:{" "}
                    <strong className="text-white">#{cola.posicionEnFila}</strong> de {cola.totalEnEspera} en espera.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Radio className="h-3.5 w-3.5" aria-hidden />
              En ventanilla ahora
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
            Total en espera en esta ventanilla: <strong className="text-slate-300">{cola.totalEnEspera}</strong>
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

      {typeof Notification !== "undefined" && notifPermission === "granted" ? (
        <div className="mt-4 space-y-3 text-center">
          <p className="text-xs text-slate-500">
            <Bell className="mr-1 inline h-3.5 w-3.5 text-sa-state-success" aria-hidden />
            Avisos del navegador activados para cuando te llamen.
          </p>
          {puedeMostrarPushFcm ? (
            <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4 text-left">
              <p className="text-sm text-slate-300">
                Activa notificaciones push en este dispositivo para recibir el aviso aunque cierres la página o cambies
                de aplicación (mejor esfuerzo; iOS puede exigir añadir el sitio a inicio).
              </p>
              <button
                type="button"
                disabled={notifBusy}
                onClick={() => void handleActivarPushSegundoPlano()}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-sa-primary/40 bg-sa-primary/15 px-4 py-2.5 text-sm font-semibold text-sa-primary-light hover:bg-sa-primary/25 disabled:opacity-50"
              >
                <Radio className="h-4 w-4" aria-hidden />
                {notifBusy ? "Registrando push…" : "Activar avisos en segundo plano (push)"}
              </button>
            </div>
          ) : null}
          {fcmPush.state === "registered" ? (
            <p className="text-xs text-slate-500">
              Push en segundo plano registrado para este turno en este dispositivo.
            </p>
          ) : null}
          {fcmPush.state === "error" && fcmPush.error ? (
            <p className="text-xs text-sa-state-error">{fcmPush.error}</p>
          ) : null}
        </div>
      ) : null}

      {typeof Notification !== "undefined" && notifPermission === "denied" ? (
        <p className="mt-4 text-center text-xs text-slate-500">
          Los avisos del navegador están bloqueados. Puedes activarlos en la configuración del sitio en tu navegador.
        </p>
      ) : null}
    </motion.section>
  );
}
