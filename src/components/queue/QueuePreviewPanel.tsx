"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { EmpresaUnidad, QueueSnapshot } from "@/types/queue";
import { QueueSnapshotMetrics } from "@/components/queue/QueueSnapshotMetrics";

interface QueuePreviewPanelProps {
  empresa: EmpresaUnidad;
  snapshot: QueueSnapshot;
  onRequestNumber: () => void;
  /** Si no se envía (p. ej. empresa fijada por QR), no se muestra “Volver” a la lista de empresas. */
  onBack?: () => void;
  /** Conexión SSE activa a Redis para esta cola */
  realtimeConnected?: boolean;
}

export function QueuePreviewPanel({
  empresa,
  snapshot,
  onRequestNumber,
  onBack,
  realtimeConnected,
}: QueuePreviewPanelProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 250 }}
      className="w-full max-w-2xl rounded-3xl border border-white/12 bg-white/[0.06] p-6 shadow-[0_20px_70px_-38px_rgba(91,135,218,0.9)] backdrop-blur-[16px]"
    >
      <QueueSnapshotMetrics
        snapshot={snapshot}
        realtimeConnected={realtimeConnected}
        variant="plain"
        title="Estado de la cola"
        descripcion={
          <>
            <span className="font-semibold text-white">{empresa.empresa}</span>
            <span className="text-slate-400"> · {empresa.ubicacion}</span>
            <span className="mt-2 block text-sm font-normal text-slate-400">
              Revisa cuántas personas hay en espera y cuántas ya fueron atendidas antes de pedir tu número.
            </span>
          </>
        }
        className="mb-6"
      />

      <div
        className={
          onBack ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-1 gap-3"
        }
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="h-12 rounded-xl border border-white/20 font-semibold text-slate-200"
          >
            Volver
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRequestNumber}
          className="h-12 rounded-xl bg-sa-primary font-semibold text-sa-text-inverted"
        >
          Solicitar mi número
        </button>
      </div>
    </motion.section>
  );
}
