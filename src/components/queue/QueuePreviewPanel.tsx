"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { EmpresaUnidad, QueueSnapshot } from "@/types/queue";

interface QueuePreviewPanelProps {
  empresa: EmpresaUnidad;
  snapshot: QueueSnapshot;
  onRequestNumber: () => void;
  /** Si no se envía (p. ej. empresa fijada por QR), no se muestra “Volver” a la lista de empresas. */
  onBack?: () => void;
  /** Conexión SSE activa a Redis para esta cola */
  realtimeConnected?: boolean;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function QueuePreviewPanel({
  empresa,
  snapshot,
  onRequestNumber,
  onBack,
  realtimeConnected,
}: QueuePreviewPanelProps) {
  const reduceMotion = useReducedMotion();
  const pendCount = snapshot.pendientes.length;
  const llamCount = snapshot.llamados.length;
  const ateCount = snapshot.atendidos.length;

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 250 }}
      className="w-full max-w-2xl rounded-3xl border border-white/12 bg-white/[0.06] p-6 shadow-[0_20px_70px_-38px_rgba(91,135,218,0.9)] backdrop-blur-[16px]"
    >
      <h1 className="mb-1 text-2xl font-bold text-white">Estado de la cola</h1>
      <p className="mb-2 text-slate-300">
        <span className="font-semibold text-white">{empresa.empresa}</span>
        <span className="text-slate-400"> · {empresa.ubicacion}</span>
      </p>
      {realtimeConnected ? (
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-sa-primary/35 bg-sa-primary/10 px-3 py-1 text-xs font-medium text-sa-primary-light">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sa-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sa-primary-light" />
          </span>
          Actualización en tiempo real
        </p>
      ) : null}
      <p className="mb-6 text-sm text-slate-400">
        Revisa cuántas personas están en espera y cuántas ya fueron atendidas antes de solicitar tu número.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="max-h-56 overflow-y-auto rounded-xl border border-white/12 bg-sa-secondary-dark/65 p-4">
          <p className="mb-2 text-sm font-semibold text-white">En espera (últimos turnos)</p>
          {snapshot.pendientes.length === 0 ? (
            <p className="text-sm text-slate-400">No hay turnos pendientes en este momento.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {snapshot.pendientes.map((row) => (
                <li key={row.uuid} className="flex justify-between gap-2 border-b border-white/10 pb-2 last:border-0">
                  <span className="font-mono font-semibold text-white">#{row.numero}</span>
                  <span className="text-slate-400">{formatTime(row.fe_registro)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="max-h-56 overflow-y-auto rounded-xl border border-white/12 bg-sa-secondary-dark/65 p-4">
          <p className="mb-2 text-sm font-semibold text-white">Atendidos recientes</p>
          {snapshot.atendidos.length === 0 ? (
            <p className="text-sm text-slate-400">Aún no hay atenciones registradas en esta vista.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {snapshot.atendidos.map((row) => (
                <li key={row.uuid} className="flex justify-between gap-2 border-b border-white/10 pb-2 last:border-0">
                  <span className="font-mono font-semibold text-slate-200">#{row.numero}</span>
                  <span className="text-slate-400">{row.fe_fin ? formatTime(row.fe_fin) : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {snapshot.llamados.length > 0 ? (
        <div className="mb-6 rounded-xl border border-sa-primary/35 bg-sa-primary/10 p-4">
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

      <div
        className={
          onBack ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"
        }
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="h-12 rounded-xl border border-white/20 text-slate-200 font-semibold"
          >
            Volver
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRequestNumber}
          className="h-12 rounded-xl bg-sa-primary text-sa-text-inverted font-semibold"
        >
          Solicitar mi número
        </button>
      </div>
    </motion.section>
  );
}
