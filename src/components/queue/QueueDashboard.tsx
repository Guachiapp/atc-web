"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Info, Radar, RefreshCw } from "lucide-react";
import { QueueCard, type QueueCardItem } from "@/components/queue/QueueCard";

const baseQueues: QueueCardItem[] = [
  {
    id: "1",
    turno: "A-042",
    ventanilla: "Mód. 2",
    empresa: "Administración",
    posicion: 3,
    etaMin: 8,
    prioridad: "normal",
    estado: "pendiente",
    actualizadoEn: "Ahora",
  },
  {
    id: "2",
    turno: "B-018",
    ventanilla: "Mód. 1",
    empresa: "Recepción",
    posicion: 1,
    etaMin: 2,
    prioridad: "critical",
    estado: "llamado",
    actualizadoEn: "Hace 20s",
  },
  {
    id: "3",
    turno: "A-039",
    ventanilla: "Mód. 3",
    empresa: "Administración",
    posicion: 2,
    etaMin: 5,
    prioridad: "high",
    estado: "pendiente",
    actualizadoEn: "Hace 50s",
  },
];

function simulateRefresh(list: QueueCardItem[]): QueueCardItem[] {
  return list
    .map((queue) => {
      const nextEta = Math.max(0, queue.etaMin - Math.floor(Math.random() * 3));
      const nextState =
        queue.estado === "pendiente" && nextEta <= 2
          ? "llamado"
          : queue.estado === "llamado" && nextEta === 0
            ? "atendiendo"
            : queue.estado;
      return {
        ...queue,
        etaMin: nextEta,
        estado: nextState,
        actualizadoEn: "Ahora",
      };
    })
    .sort((a, b) => a.posicion - b.posicion);
}

export function QueueDashboard() {
  const reduceMotion = useReducedMotion();
  const [queues, setQueues] = useState(baseQueues);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const stats = useMemo(() => {
    const pending = queues.filter((q) => q.estado === "pendiente").length;
    const called = queues.filter((q) => q.estado === "llamado").length;
    const avgEta = Math.ceil(queues.reduce((acc, q) => acc + q.etaMin, 0) / queues.length);
    return { pending, called, avgEta };
  }, [queues]);

  const refreshQueues = () => {
    setIsRefreshing(true);
    window.setTimeout(() => {
      setQueues((current) => simulateRefresh(current));
      setIsRefreshing(false);
    }, 900);
  };

  return (
    <section
      className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-[16px] sm:p-6"
      aria-label="Ejemplo visual de cola de atención"
    >
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 inline-flex items-center gap-2 rounded-full border border-sa-primary/50 bg-sa-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sa-primary-light">
            <Radar className="h-3.5 w-3.5" />
            Ejemplo visual (no conectado a datos reales)
          </p>
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Cómo se ve la cola para el visitante</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-300">
            En la vida real verás tu lugar en la fila y una idea del tiempo de espera; la pantalla del
            turno se va actualizando sola y puedes recibir avisos cuando te llamen o cuando falte poco para
            que te toque.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshQueues}
          className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-xl border border-white/20 px-3 text-sm font-semibold text-slate-100 hover:border-sa-primary/70 sm:self-center"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Simular cambio
        </button>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-white/10 bg-sa-secondary-dark/50 px-3 py-2 text-xs text-slate-400">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sa-primary-light" aria-hidden />
        <p>
          Para unirte a la fila usa el <span className="text-slate-200">código en recepción</span>. Esto que
          ves aquí es solo un ejemplo con turno, ventanilla y estado.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-white/10 bg-sa-secondary-dark/70 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">En espera</p>
          <p className="text-2xl font-bold text-white">{stats.pending}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-sa-secondary-dark/70 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Llamados</p>
          <motion.p
            animate={reduceMotion ? undefined : { scale: stats.called > 0 ? [1, 1.08, 1] : 1 }}
            transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.5 }}
            className="text-2xl font-bold text-sa-primary-light"
          >
            {stats.called}
          </motion.p>
        </div>
        <div className="rounded-xl border border-white/10 bg-sa-secondary-dark/70 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Tiempo est. medio</p>
          <p className="text-2xl font-bold text-white">{stats.avgEta}m</p>
        </div>
      </div>

      {isRefreshing ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Cargando actualización">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/[0.05]"
            />
          ))}
        </div>
      ) : (
        <motion.div
          variants={{
            hidden: {},
            show: {
              transition: { staggerChildren: 0.06, delayChildren: 0.06 },
            },
          }}
          initial={reduceMotion ? false : "hidden"}
          animate={reduceMotion ? undefined : "show"}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {queues.map((queue) => (
              <QueueCard key={queue.id} item={queue} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </section>
  );
}
