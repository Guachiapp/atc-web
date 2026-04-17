"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Bell, Building2, Clock3, Sparkles, Ticket, TriangleAlert, UserCheck } from "lucide-react";

type QueuePriority = "normal" | "high" | "critical";
type QueueState = "pendiente" | "llamado" | "atendiendo";

export type QueueCardItem = {
  id: string;
  /** Código del turno mostrado al visitante (ej. A-042). */
  turno: string;
  /** Ventanilla o módulo de atención. */
  ventanilla: string;
  /** Nombre corto de empresa o unidad (solo ilustrativo en la landing). */
  empresa?: string;
  posicion: number;
  etaMin: number;
  prioridad: QueuePriority;
  estado: QueueState;
  actualizadoEn: string;
};

type QueueCardProps = {
  item: QueueCardItem;
};

const priorityStyles: Record<QueuePriority, string> = {
  normal: "text-sa-primary border-sa-primary/30 bg-sa-primary/10",
  high: "text-sa-state-warning border-sa-state-warning/40 bg-sa-state-warning/10",
  critical: "text-sa-state-error border-sa-state-error/40 bg-sa-state-error/10",
};

const stateStyles: Record<QueueState, string> = {
  pendiente: "text-slate-200",
  llamado: "text-sa-primary-light",
  atendiendo: "text-sa-state-success",
};

function estadoEtiqueta(estado: QueueState): string {
  if (estado === "pendiente") return "En espera";
  if (estado === "llamado") return "Llamado";
  return "En atención";
}

function EstadoIcon({ estado }: { estado: QueueState }) {
  const common = "h-3.5 w-3.5";
  if (estado === "pendiente") return <Clock3 className={`${common} text-slate-400`} />;
  if (estado === "llamado") return <Bell className={`${common} text-sa-primary-light`} />;
  return <UserCheck className={`${common} text-sa-state-success`} />;
}

function formatEta(etaMin: number): string {
  if (etaMin <= 0) return "Ahora";
  return `${etaMin} min`;
}

function MetricStripItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-3 py-2 text-center sm:px-4 sm:py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="min-w-0 font-semibold leading-tight text-white">{children}</div>
    </div>
  );
}

export function QueueCard({ item }: QueueCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
      whileHover={reduceMotion ? undefined : { y: -2, scale: 1.02 }}
      transition={{ type: "spring", damping: 25, stiffness: 250 }}
      className="rounded-2xl border border-white/12 bg-white/[0.06] p-4 shadow-[0_10px_35px_-20px_rgba(91,135,218,0.9)] backdrop-blur-[16px] sm:p-5"
      aria-label={`Turno ${item.turno} en ventanilla ${item.ventanilla}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Turno</p>
          <p className="flex items-center gap-2 text-lg font-semibold text-white">
            <Ticket className="h-5 w-5 shrink-0 text-sa-primary-light" aria-hidden />
            {item.turno}
          </p>
          {item.empresa ? (
            <p className="mt-0.5 text-xs text-slate-500">{item.empresa}</p>
          ) : null}
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${priorityStyles[item.prioridad]}`}
        >
          {item.prioridad}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-sa-secondary-dark/60 sm:flex-row sm:divide-x sm:divide-y-0">
        <MetricStripItem label="Posición">
          <span className="text-xl tabular-nums sm:text-2xl">#{item.posicion}</span>
        </MetricStripItem>
        <MetricStripItem label="Ventanilla">
          <div className="flex max-w-full items-center justify-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <span className="break-words text-lg sm:text-xl">{item.ventanilla}</span>
          </div>
        </MetricStripItem>
        <MetricStripItem label="Tiempo">
          <span className="text-xl tabular-nums sm:text-2xl">{formatEta(item.etaMin)}</span>
        </MetricStripItem>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-300">
        <span className={`inline-flex items-center gap-1.5 ${stateStyles[item.estado]}`}>
          <EstadoIcon estado={item.estado} />
          {estadoEtiqueta(item.estado)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5 text-slate-400" />
          {item.actualizadoEn}
        </span>
        {item.prioridad === "critical" ? (
          <span className="inline-flex items-center gap-1 text-sa-state-error">
            <TriangleAlert className="h-3.5 w-3.5" />
            prioridad
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sa-primary-light">
            <Sparkles className="h-3.5 w-3.5" />
            cola estándar
          </span>
        )}
      </div>
    </motion.article>
  );
}
