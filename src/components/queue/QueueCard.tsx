"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Clock3, PlaneTakeoff, RadioTower, TriangleAlert } from "lucide-react";

type QueuePriority = "normal" | "high" | "critical";
type QueueState = "pendiente" | "llamado" | "abordando";

export type QueueCardItem = {
  id: string;
  vuelo: string;
  puerta: string;
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
  abordando: "text-sa-state-success",
};

function formatEta(etaMin: number): string {
  if (etaMin <= 0) return "Ahora";
  return `${etaMin} min`;
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
      className="rounded-2xl border border-white/12 bg-white/[0.06] p-4 shadow-[0_10px_35px_-20px_rgba(91,135,218,0.9)] backdrop-blur-[16px]"
      aria-label={`Cola ${item.vuelo} en puerta ${item.puerta}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Vuelo</p>
          <p className="text-lg font-semibold text-white">{item.vuelo}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${priorityStyles[item.prioridad]}`}
        >
          {item.prioridad}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-xl border border-white/10 bg-sa-secondary-dark/60 p-3">
          <p className="text-xs text-slate-400">Posición</p>
          <p className="text-xl font-bold text-white">#{item.posicion}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-sa-secondary-dark/60 p-3">
          <p className="text-xs text-slate-400">Puerta</p>
          <p className="text-xl font-bold text-white">{item.puerta}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-sa-secondary-dark/60 p-3">
          <p className="text-xs text-slate-400">ETA</p>
          <p className="text-xl font-bold text-white">{formatEta(item.etaMin)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-300">
        <span className={`inline-flex items-center gap-1.5 ${stateStyles[item.estado]}`}>
          <RadioTower className="h-3.5 w-3.5" />
          {item.estado}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5 text-slate-400" />
          {item.actualizadoEn}
        </span>
        {item.prioridad === "critical" ? (
          <span className="inline-flex items-center gap-1 text-sa-state-error">
            <TriangleAlert className="h-3.5 w-3.5" />
            atención inmediata
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sa-primary-light">
            <PlaneTakeoff className="h-3.5 w-3.5" />
            flujo normal
          </span>
        )}
      </div>
    </motion.article>
  );
}
