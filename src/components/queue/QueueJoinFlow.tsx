"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { DeviceFingerprint, EmpresaUnidad, QueueSnapshot, QueueTicket } from "@/types/queue";
import { TicketConfirmation } from "@/components/queue/TicketConfirmation";
import { QueuePreviewPanel } from "@/components/queue/QueuePreviewPanel";
import { useQueueTicketStream } from "@/hooks/use-queue-ticket-stream";

type Step = "loading" | "select" | "queuePreview" | "form" | "done" | "error";
type CaptchaState = {
  required: boolean;
  token: string;
  message: string;
};

interface QueueJoinFlowProps {
  qrToken: string;
}

const DEVICE_INSTALL_STORAGE_KEY = "atc.queue.device.install-id";

function createUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getOrCreateDeviceInstallId(): string {
  if (typeof window === "undefined") return "";
  const current = window.localStorage.getItem(DEVICE_INSTALL_STORAGE_KEY);
  if (current && current.trim().length > 8) return current;
  const created = createUuid();
  window.localStorage.setItem(DEVICE_INSTALL_STORAGE_KEY, created);
  return created;
}

function collectDeviceFingerprint(): DeviceFingerprint | null {
  if (typeof window === "undefined") return null;
  const installId = getOrCreateDeviceInstallId();
  if (!installId) return null;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  return {
    installId,
    platform: navigator.platform || "unknown",
    language: navigator.language || "unknown",
    timezone: tz,
    screenWidth: window.screen?.width || window.innerWidth || 1,
    screenHeight: window.screen?.height || window.innerHeight || 1,
    pixelRatio: Math.max(1, Number(window.devicePixelRatio || 1)),
  };
}

async function waitForDeviceFingerprint(maxMs = 2500): Promise<DeviceFingerprint | null> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const fp = collectDeviceFingerprint();
    if (fp) return fp;
    await new Promise((r) => setTimeout(r, 50));
  }
  return collectDeviceFingerprint();
}

async function fetchDeviceTicket(
  empresa: EmpresaUnidad,
  queueSessionToken: string,
  device: DeviceFingerprint,
): Promise<QueueTicket | null> {
  const response = await fetch("/api/queue/device/ticket/current", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queueSessionToken,
      userIdEmpresa: empresa.userId,
      device,
    }),
  });
  const json = (await response.json()) as {
    success?: boolean;
    data?: { ticket?: QueueTicket | null } | null;
    error?: string;
  };
  if (!json.success) {
    throw new Error(json.error || "No se pudo validar ticket persistido del dispositivo");
  }
  return json.data?.ticket ?? null;
}

export function QueueJoinFlow({ qrToken }: QueueJoinFlowProps) {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("loading");
  const [queueSessionToken, setQueueSessionToken] = useState("");
  const [empresas, setEmpresas] = useState<EmpresaUnidad[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaUnidad | null>(null);
  const [ticket, setTicket] = useState<QueueTicket | null>(null);
  const [error, setError] = useState("");
  const [captchaInit, setCaptchaInit] = useState<CaptchaState>({
    required: false,
    token: "",
    message: "",
  });
  const [captchaTicket, setCaptchaTicket] = useState<CaptchaState>({
    required: false,
    token: "",
    message: "",
  });
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [queueSnapshot, setQueueSnapshot] = useState<QueueSnapshot | null>(null);
  const [queuePreviewLoading, setQueuePreviewLoading] = useState(false);
  const [queuePreviewError, setQueuePreviewError] = useState("");
  const [deviceFingerprint, setDeviceFingerprint] = useState<DeviceFingerprint | null>(null);
  const [empresaLockedByQr, setEmpresaLockedByQr] = useState(false);
  const [queuePreviewLive, setQueuePreviewLive] = useState(false);

  const loadQueuePreview = async (
    empresaOverride?: EmpresaUnidad,
    sessionTokenOverride?: string,
    opts?: { refreshOnly?: boolean },
  ) => {
    const empresa = empresaOverride ?? selectedEmpresa;
    const tok = sessionTokenOverride ?? queueSessionToken;
    if (!empresa || !tok) return;
    const refreshOnly = opts?.refreshOnly === true;
    if (!refreshOnly) {
      setQueuePreviewError("");
      setQueueSnapshot(null);
      setQueuePreviewLoading(true);
    }
    try {
      const params = new URLSearchParams({
        queueSessionToken: tok,
        userIdEmpresa: String(empresa.userId),
        userRolIdEmpresa: String(empresa.userRolId),
        limit: "20",
      });
      const res = await fetch(`/api/queue/info?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "No se pudo cargar la cola");
      setQueueSnapshot(json.data as QueueSnapshot);
    } catch (err) {
      if (refreshOnly) {
        console.warn("[QueueJoinFlow] refresh cola en segundo plano falló", err);
      } else {
        setQueuePreviewError(err instanceof Error ? err.message : "Error al consultar la cola");
      }
    } finally {
      if (!refreshOnly) setQueuePreviewLoading(false);
    }
  };

  const refreshQueuePreviewLiveRef = useRef<() => void>(() => {});
  refreshQueuePreviewLiveRef.current = () => {
    if (!selectedEmpresa || !queueSessionToken) return;
    void loadQueuePreview(selectedEmpresa, queueSessionToken, { refreshOnly: true });
  };

  useQueueTicketStream(
    {
      queueSessionToken,
      userIdEmpresa: selectedEmpresa?.userId ?? 0,
      userRolIdEmpresa: selectedEmpresa?.userRolId ?? 0,
      enabled:
        step === "queuePreview" && !!selectedEmpresa && queueSessionToken.length > 0,
    },
    (_payload) => {
      refreshQueuePreviewLiveRef.current();
    },
    {
      onOpen: () => setQueuePreviewLive(true),
      onConnectionLost: () => setQueuePreviewLive(false),
    },
  );

  useEffect(() => {
    if (step !== "queuePreview") setQueuePreviewLive(false);
  }, [step]);

  const enterQueueFlow = async (
    empresa: EmpresaUnidad,
    sessionToken: string,
    device: DeviceFingerprint,
  ) => {
    setQueuePreviewError("");
    try {
      const existingTicket = await fetchDeviceTicket(empresa, sessionToken, device);
      if (existingTicket) {
        setTicket(existingTicket);
        setStep("done");
        return;
      }
    } catch (recoverError) {
      setQueuePreviewError(
        recoverError instanceof Error
          ? recoverError.message
          : "No se pudo consultar ticket persistido del dispositivo",
      );
    }
    setStep("queuePreview");
    await loadQueuePreview(empresa, sessionToken);
  };

  const initSession = async (captchaToken?: string) => {
    try {
      const initResponse = await fetch("/api/queue/session/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: qrToken, captchaToken }),
      });
      const initJson = await initResponse.json();
      if (!initJson.success) {
        if (initJson.captchaRequired) {
          setError(initJson.error || "Validación CAPTCHA requerida");
          setCaptchaInit({
            required: true,
            token: captchaToken ?? "",
            message: initJson.error || "Validación CAPTCHA requerida",
          });
          setStep("error");
          return;
        }
        throw new Error(initJson.error || "QR inválido");
      }

      setQueueSessionToken(initJson.data.queueSessionToken);
      setCaptchaInit({ required: false, token: "", message: "" });

      const listResponse = await fetch(
        `/api/queue/unidades?queueSessionToken=${encodeURIComponent(initJson.data.queueSessionToken)}`,
      );
      const listJson = await listResponse.json();
      if (!listJson.success) throw new Error(listJson.error || "No se pudo consultar empresas");

      const list = listJson.data.empresasPorOficina as EmpresaUnidad[];
      setEmpresas(list);

      const qrEmpresaId = initJson.data.empresaId as number | null | undefined;
      if (qrEmpresaId != null && typeof qrEmpresaId === "number") {
        const row = list.find((e) => e.userId === qrEmpresaId);
        if (!row) {
          setError("La empresa del código QR no está disponible en este condominio.");
          setStep("error");
          return;
        }
        setSelectedEmpresa(row);
        setEmpresaLockedByQr(true);
        const device = await waitForDeviceFingerprint();
        if (!device) {
          setError("No se pudo identificar el dispositivo. Recarga la página.");
          setStep("error");
          return;
        }
        setDeviceFingerprint(device);
        await enterQueueFlow(row, initJson.data.queueSessionToken, device);
        return;
      }

      setEmpresaLockedByQr(false);
      setSelectedEmpresa(null);
      setStep("select");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar la sesión");
      setStep("error");
    }
  };

  useEffect(() => {
    setDeviceFingerprint(collectDeviceFingerprint());
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await initSession();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo iniciar la sesión");
        setStep("error");
      }
    };

    init();
  }, [qrToken]);

  const canSubmitData = useMemo(
    () => [nombre, cedula, telefono, correo].some((value) => value.trim().length > 0),
    [nombre, cedula, telefono, correo],
  );

  const handleGenerateTicket = async () => {
    if (!selectedEmpresa) return;
    if (!deviceFingerprint) {
      throw new Error("No se pudo identificar el dispositivo. Recarga la página para continuar.");
    }

    const uuid = createUuid();
    const idempotencyKey = createUuid();

    const ticketResponse = await fetch("/api/queue/generar-ticket", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        queueSessionToken,
        captchaToken: captchaTicket.required ? captchaTicket.token : undefined,
        uuid,
        userIdEmpresa: selectedEmpresa.userId,
        userRolIdEmpresa: selectedEmpresa.userRolId,
        device: deviceFingerprint,
      }),
    });

    const ticketJson = await ticketResponse.json();
    if (!ticketJson.success) {
      if (ticketJson.captchaRequired) {
        setCaptchaTicket({
          required: true,
          token: "",
          message: ticketJson.error || "Validación CAPTCHA requerida para generar ticket",
        });
        throw new Error(ticketJson.error || "CAPTCHA requerido");
      }
      throw new Error(ticketJson.error || "No se pudo generar ticket");
    }
    setCaptchaTicket({ required: false, token: "", message: "" });

    if (canSubmitData) {
      await fetch(`/api/queue/datos-cliente/${uuid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueSessionToken,
          nombre: nombre.trim() || undefined,
          cedula: cedula.trim() || undefined,
          telefono: telefono.trim() || undefined,
          correo: correo.trim() || undefined,
        }),
      });
    }

    setTicket(ticketJson.data);
    setStep("done");
  };

  const handleContinueFromSelect = async () => {
    if (!selectedEmpresa) return;
    if (!deviceFingerprint) {
      setError("No se pudo identificar el dispositivo. Recarga la página.");
      setStep("error");
      return;
    }
    await enterQueueFlow(selectedEmpresa, queueSessionToken, deviceFingerprint);
  };

  if (step === "loading") {
    return (
      <div className="w-full max-w-2xl rounded-3xl border border-white/12 bg-white/[0.05] p-6 text-center backdrop-blur-[16px]">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-sa-primary/40 border-t-sa-primary" />
        <p className="text-slate-200">Validando QR y cargando empresas...</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 250 }}
        className="w-full max-w-xl rounded-3xl border border-sa-state-error/35 bg-white/[0.06] p-6 backdrop-blur-[16px]"
      >
        <h2 className="mb-2 text-xl font-bold text-sa-state-error">No se pudo continuar</h2>
        <p className="text-slate-200">{error}</p>
        {captchaInit.required ? (
          <div className="mt-4">
            <p className="mb-2 text-sm text-slate-300">{captchaInit.message}</p>
            <input
              value={captchaInit.token}
              onChange={(e) => setCaptchaInit((prev) => ({ ...prev, token: e.target.value }))}
              placeholder="Token CAPTCHA/Turnstile"
              className="mb-3 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500"
            />
            <button
              onClick={() => {
                setStep("loading");
                initSession(captchaInit.token).catch((err) => {
                  setError(err instanceof Error ? err.message : "Error en validación");
                  setStep("error");
                });
              }}
              className="h-10 px-4 rounded-lg bg-sa-primary text-sa-text-inverted font-semibold"
            >
              Reintentar validación
            </button>
          </div>
        ) : null}
      </motion.section>
    );
  }

  if (step === "done" && ticket && selectedEmpresa) {
    return (
      <TicketConfirmation
        ticket={ticket}
        queueSessionToken={queueSessionToken}
        userIdEmpresa={selectedEmpresa.userId}
        userRolIdEmpresa={selectedEmpresa.userRolId}
        empresaNombre={selectedEmpresa.empresa}
        empresaUbicacion={selectedEmpresa.ubicacion}
        device={deviceFingerprint}
      />
    );
  }

  if (step === "queuePreview") {
    if (queuePreviewLoading && !queueSnapshot && !queuePreviewError) {
      return (
        <div className="w-full max-w-2xl rounded-3xl border border-white/12 bg-white/[0.05] p-6 text-center backdrop-blur-[16px]">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-sa-primary/40 border-t-sa-primary" />
          <p className="text-slate-200">Consultando estado de la cola…</p>
        </div>
      );
    }
    if (queuePreviewError) {
      return (
        <section className="w-full max-w-xl rounded-3xl border border-sa-state-error/35 bg-white/[0.06] p-6 backdrop-blur-[16px]">
          <h2 className="mb-2 text-xl font-bold text-sa-state-error">No se pudo cargar la cola</h2>
          <p className="mb-4 text-slate-200">{queuePreviewError}</p>
          <div className="flex flex-wrap gap-3">
            {!empresaLockedByQr ? (
              <button
                type="button"
                onClick={() => {
                  setStep("select");
                  setQueuePreviewError("");
                }}
                className="h-10 rounded-lg border border-white/25 px-4 font-semibold text-slate-200"
              >
                Volver
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void loadQueuePreview()}
              className="h-10 px-4 rounded-lg bg-sa-primary text-sa-text-inverted font-semibold"
            >
              Reintentar
            </button>
          </div>
        </section>
      );
    }
    if (queueSnapshot && selectedEmpresa) {
      return (
        <QueuePreviewPanel
          empresa={selectedEmpresa}
          snapshot={queueSnapshot}
          onRequestNumber={() => setStep("form")}
          realtimeConnected={queuePreviewLive}
          onBack={
            empresaLockedByQr
              ? undefined
              : () => {
                  setQueueSnapshot(null);
                  setStep("select");
                }
          }
        />
      );
    }
    return null;
  }

  if (step === "select") {
    return (
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 250 }}
        className="w-full max-w-2xl rounded-3xl border border-white/12 bg-white/[0.06] p-6 shadow-[0_20px_70px_-38px_rgba(91,135,218,0.95)] backdrop-blur-[16px]"
      >
        <h1 className="mb-2 text-2xl font-bold text-white">Solicitar turno</h1>
        <p className="mb-6 text-slate-300">
          Selecciona la empresa/taquilla donde deseas ser atendido.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {empresas.map((empresa) => {
            const active = selectedEmpresa?.userId === empresa.userId;
            return (
              <motion.button
                key={`${empresa.userId}-${empresa.userRolId}`}
                onClick={() => setSelectedEmpresa(empresa)}
                whileHover={reduceMotion ? undefined : { y: -2, scale: 1.02 }}
                transition={{ type: "spring", damping: 25, stiffness: 250 }}
                className={`rounded-xl border p-4 text-left transition ${
                  active
                    ? "border-sa-primary/60 bg-sa-primary/15"
                    : "border-white/15 bg-white/[0.03] hover:border-sa-primary/50"
                }`}
              >
                <p className="font-semibold text-white">{empresa.empresa}</p>
                <p className="text-sm text-slate-300">{empresa.ubicacion}</p>
              </motion.button>
            );
          })}
        </div>

        <button
          disabled={!selectedEmpresa || !deviceFingerprint}
          onClick={() => void handleContinueFromSelect()}
          className="h-12 w-full rounded-xl bg-sa-primary text-sa-text-inverted font-semibold disabled:opacity-50"
        >
          Ver estado de la cola
        </button>
        {!deviceFingerprint ? (
          <p className="mt-2 text-sm text-sa-state-warning">
            No se pudo registrar el dispositivo. Recarga para continuar.
          </p>
        ) : null}
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 250 }}
      className="w-full max-w-2xl rounded-3xl border border-white/12 bg-white/[0.06] p-6 shadow-[0_20px_70px_-38px_rgba(91,135,218,0.95)] backdrop-blur-[16px]"
    >
      <h2 className="mb-2 text-2xl font-bold text-white">Datos del visitante</h2>
      <p className="mb-6 text-slate-300">Estos campos son opcionales para el MVP.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre completo"
          className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500"
        />
        <input
          value={cedula}
          onChange={(e) => setCedula(e.target.value)}
          placeholder="Cédula"
          className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500"
        />
        <input
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Teléfono"
          className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500"
        />
        <input
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder="Correo"
          className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500"
        />
      </div>

      {captchaTicket.required ? (
        <div className="mb-4">
          <p className="mb-2 text-sm text-slate-300">{captchaTicket.message}</p>
          <input
            value={captchaTicket.token}
            onChange={(e) => setCaptchaTicket((prev) => ({ ...prev, token: e.target.value }))}
            placeholder="Token CAPTCHA/Turnstile"
            className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => {
            setStep("queuePreview");
            void loadQueuePreview();
          }}
          className="h-12 rounded-xl border border-white/25 text-slate-200 font-semibold"
        >
          Volver
        </button>
        <button
          onClick={() =>
            handleGenerateTicket().catch((err) => {
              setError(err instanceof Error ? err.message : "Error generando ticket");
              setStep("error");
            })
          }
          className="h-12 rounded-xl bg-sa-primary text-sa-text-inverted font-semibold"
        >
          Generar turno
        </button>
      </div>
    </motion.section>
  );
}
