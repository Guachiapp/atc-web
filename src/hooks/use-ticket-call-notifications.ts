"use client";

import { useEffect, useRef } from "react";

const NOTIFICATION_TAG = "guachi-atc-llamado";

/**
 * Notificación del sistema cuando el turno pasa a "llamado" (mejor esfuerzo).
 * - Requiere permiso del usuario (Notification API).
 * - Si la pestaña está en segundo plano, el aviso es más visible.
 * - No es "push" del sistema operativo con la app cerrada: para eso haría falta Web Push + service worker + backend.
 */
export function useTicketCallNotifications(options: {
  estado: string;
  ticketNumero: number;
  empresaLine?: string;
  puestoLabel?: string | null;
  /** Solo tras el primer poll/stream, evita disparar al hidratar ya en llamado salvo que sea transición real */
  datosListos: boolean;
}) {
  const prevEstado = useRef<string | null>(null);
  const inicializado = useRef(false);

  useEffect(() => {
    if (!options.datosListos) return;

    if (!inicializado.current) {
      inicializado.current = true;
      prevEstado.current = options.estado;
      return;
    }

    const antes = prevEstado.current;
    const ahora = options.estado;

    if (antes !== "llamado" && ahora === "llamado") {
      const titulo = "¡Te están llamando!";
      const puesto = options.puestoLabel?.trim();
      const cuerpo = [
        `Turno ${options.ticketNumero}`,
        options.empresaLine,
        puesto ? `Puesto: ${puesto}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const icon =
            typeof window !== "undefined"
              ? new URL("/images/guachi_logo_azul_horizontal.png", window.location.origin).href
              : undefined;
          new Notification(titulo, {
            body: cuerpo,
            icon,
            tag: NOTIFICATION_TAG,
            requireInteraction: true,
          });
        } catch {
          /* Safari / políticas estrictas */
        }
      }

      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate([280, 120, 280]);
        } catch {
          /* noop */
        }
      }
    }

    prevEstado.current = ahora;
  }, [options.estado, options.ticketNumero, options.empresaLine, options.puestoLabel, options.datosListos]);
}

export async function requestTicketNotificationsPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}
