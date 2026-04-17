"use client";

import { useEffect, useId, useRef } from "react";
import { Bell, Volume2, X } from "lucide-react";

export interface TicketNotificationPromptModalProps {
  open: boolean;
  busy: boolean;
  /** Texto opcional si hay push FCM configurado en el sitio. */
  fcmConfigured: boolean;
  onActivate: () => void | Promise<void>;
  onDismiss: () => void;
}

/**
 * Modal propio (no alert() nativo) para pedir permiso de notificaciones al tomar turno — visible sin depender del scroll.
 */
export function TicketNotificationPromptModal({
  open,
  busy,
  fcmConfigured,
  onActivate,
  onDismiss,
}: TicketNotificationPromptModalProps) {
  const titleId = useId();
  const descId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      primaryRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center sm:p-6"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        onClick={() => onDismiss()}
        disabled={busy}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/15 bg-[#121a28] p-6 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.85)]"
      >
        <button
          type="button"
          onClick={() => onDismiss()}
          disabled={busy}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
          aria-label="Cerrar aviso"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex justify-center">
          <div className="rounded-2xl bg-sa-primary/20 p-4 text-sa-primary-light">
            <Bell className="h-10 w-10" strokeWidth={1.5} aria-hidden />
          </div>
        </div>

        <h2 id={titleId} className="pr-8 text-center text-xl font-bold text-white">
          ¿Recibir avisos de tu turno?
        </h2>
        <p id={descId} className="mt-3 text-center text-sm leading-relaxed text-slate-300">
          Te avisaremos cuando te llamen o cuando te quedes cerca de ser atendido, aunque cambies de app o apagues la
          pantalla.
          {fcmConfigured ? (
            <span className="mt-2 block text-slate-400">
              Incluye avisos en segundo plano en este dispositivo (según el navegador).
            </span>
          ) : (
            <span className="mt-2 block text-slate-500">
              Activa los avisos del navegador para no perderte el llamado.
            </span>
          )}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            ref={primaryRef}
            type="button"
            disabled={busy}
            onClick={() => void onActivate()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sa-primary px-5 py-3.5 text-base font-semibold text-white shadow-lg shadow-sa-primary/25 hover:bg-sa-primary-dark disabled:opacity-50"
          >
            <Volume2 className="h-5 w-5 shrink-0" aria-hidden />
            {busy ? "Abriendo permisos…" : "Activar avisos"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDismiss()}
            className="rounded-2xl border border-white/15 bg-transparent px-5 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
          >
            Ahora no
          </button>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-500">
          Puedes cambiar esto en cualquier momento en la configuración del sitio en tu navegador.
        </p>
      </div>
    </div>
  );
}
