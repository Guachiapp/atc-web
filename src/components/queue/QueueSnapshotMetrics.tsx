"use client";

import type { ReactNode } from "react";
import type { QueueSnapshot } from "@/types/queue";

export function formatQueueRowTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

interface QueueSnapshotMetricsProps {
  snapshot: QueueSnapshot;
  realtimeConnected?: boolean;
  /** Título de la sección (p. ej. vista previa vs. pantalla de ticket) */
  title?: string;
  descripcion?: ReactNode;
  /** `card`: panel con borde; `plain`: solo contenido (p. ej. dentro de otro contenedor ya enmarcado). */
  variant?: "card" | "plain";
  className?: string;
}

/**
 * Métricas y listas de la cola (GET `/api/queue/info`), mismo contenido que en la vista previa al escanear el QR.
 */
export function QueueSnapshotMetrics({
  snapshot,
  realtimeConnected,
  title = "Estado de la cola",
  descripcion = "Resumen de esta ventanilla: personas en espera, en llamado y atendidas recientemente.",
  variant = "card",
  className = "",
}: QueueSnapshotMetricsProps) {
  const pendCount = snapshot.pendientes.length;
  const llamCount = snapshot.llamados.length;
  const ateCount = snapshot.atendidos.length;

  const shell =
    variant === "plain"
      ? ""
      : "rounded-2xl border border-white/12 bg-sa-secondary-dark/40 p-5 backdrop-blur-[12px]";

  return (
    <div className={`${shell} ${className}`.trim()}>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <div className="text-sm text-slate-400">{descripcion}</div>
        </div>
        {realtimeConnected ? (
          <p className="inline-flex shrink-0 items-center gap-2 rounded-full border border-sa-primary/35 bg-sa-primary/10 px-3 py-1 text-xs font-medium text-sa-primary-light">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sa-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sa-primary-light" />
            </span>
            En vivo
          </p>
        ) : null}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-sa-secondary-dark/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Pendientes</p>
          <p className="text-3xl font-bold text-sa-primary">{pendCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-sa-secondary-dark/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">En llamado</p>
          <p className="text-3xl font-bold text-sa-primary-light">{llamCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-sa-secondary-dark/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Atendidos</p>
          <p className="text-3xl font-bold text-white">{ateCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="max-h-52 overflow-y-auto rounded-xl border border-white/12 bg-sa-secondary-dark/65 p-4">
          <p className="mb-2 text-sm font-semibold text-white">En espera (últimos turnos)</p>
          {snapshot.pendientes.length === 0 ? (
            <p className="text-sm text-slate-400">No hay turnos pendientes en este momento.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {snapshot.pendientes.map((row) => (
                <li
                  key={row.uuid}
                  className="flex justify-between gap-2 border-b border-white/10 pb-2 last:border-0"
                >
                  <span className="font-mono font-semibold text-white">#{row.numero}</span>
                  <span className="text-slate-400">{formatQueueRowTime(row.fe_registro)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="max-h-52 overflow-y-auto rounded-xl border border-white/12 bg-sa-secondary-dark/65 p-4">
          <p className="mb-2 text-sm font-semibold text-white">Atendidos recientes</p>
          {snapshot.atendidos.length === 0 ? (
            <p className="text-sm text-slate-400">Aún no hay atenciones registradas en esta vista.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {snapshot.atendidos.map((row) => (
                <li
                  key={row.uuid}
                  className="flex justify-between gap-2 border-b border-white/10 pb-2 last:border-0"
                >
                  <span className="font-mono font-semibold text-slate-200">#{row.numero}</span>
                  <span className="text-slate-400">{row.fe_fin ? formatQueueRowTime(row.fe_fin) : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {snapshot.llamados.length > 0 ? (
        <div className="mt-4 rounded-xl border border-sa-primary/35 bg-sa-primary/10 p-4">
          <p className="mb-2 text-sm font-semibold text-white">Turnos en llamado</p>
          <ul className="flex flex-wrap gap-2">
            {snapshot.llamados.map((row) => (
              <li
                key={row.uuid}
                className="rounded-lg border border-sa-primary/30 bg-sa-secondary-dark/70 px-3 py-1 text-sm font-mono font-semibold text-sa-primary-light"
              >
                #{row.numero}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
