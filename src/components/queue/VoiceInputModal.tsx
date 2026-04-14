"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Mic, Sparkles, X } from "lucide-react";

type VoiceInputModalProps = {
  open: boolean;
  onClose: () => void;
  onCommand: (command: string) => void;
};

const presets = [
  "Siguiente cola",
  "Prioridad alta",
  "Mostrar pendientes",
  "Actualizar tablero",
];

export function VoiceInputModal({ open, onClose, onCommand }: VoiceInputModalProps) {
  const reduceMotion = useReducedMotion();
  const [command, setCommand] = useState("");

  useEffect(() => {
    if (!open) setCommand("");
  }, [open]);

  useEffect(() => {
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  const trimmed = useMemo(() => command.trim(), [command]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={reduceMotion ? undefined : { opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Comandos por voz"
        >
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: "spring", damping: 25, stiffness: 250 }}
            className="w-full max-w-lg rounded-3xl border border-white/10 bg-sa-secondary-dark/95 p-6 shadow-2xl backdrop-blur-[16px]"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex rounded-full bg-sa-primary/20 p-2 text-sa-primary-light">
                  <Mic className="h-4 w-4" />
                </span>
                <h3 className="text-lg font-semibold text-white">Comando por voz</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/20 p-1.5 text-slate-300 hover:border-white/40 hover:text-white"
                aria-label="Cerrar modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-4 text-sm text-slate-300">
              Inspirado en controles de voz de cabina: dispara acciones rápidas sin navegar pantallas.
            </p>

            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">Comando</label>
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder='Ejemplo: "siguiente cola"'
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none ring-sa-primary/60 placeholder:text-slate-500 focus:ring-2"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCommand(preset)}
                  className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-slate-200 hover:border-sa-primary/60 hover:text-white"
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-11 flex-1 rounded-xl border border-white/20 text-sm font-semibold text-slate-200 hover:border-white/45"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!trimmed}
                onClick={() => {
                  if (!trimmed) return;
                  onCommand(trimmed);
                  onClose();
                }}
                className="h-11 flex-1 rounded-xl bg-sa-primary text-sm font-semibold text-white disabled:opacity-40"
              >
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Ejecutar
                </span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
