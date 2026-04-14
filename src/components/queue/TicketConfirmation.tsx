"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { GuachiLogo } from "@/components/brand/GuachiLogo";
import { useQueueTicketStream } from "@/hooks/use-queue-ticket-stream";
import type { QueueStatus, QueueTicket } from "@/types/queue";

interface TicketConfirmationProps {
  ticket: QueueTicket;
  queueSessionToken: string;
  userIdEmpresa: number;
  userRolIdEmpresa: number;
}

export function TicketConfirmation({
  ticket,
  queueSessionToken,
  userIdEmpresa,
  userRolIdEmpresa,
}: TicketConfirmationProps) {
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<QueueStatus>({
    estado: ticket.estado,
    mensaje: "Tu turno está en cola",
    updatedAt: new Date().toISOString(),
  });
  const [pollError, setPollError] = useState("");
  const [ticketLive, setTicketLive] = useState(false);

  const pollStatus = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        queueSessionToken,
        userIdEmpresa: String(userIdEmpresa),
        userRolIdEmpresa: String(userRolIdEmpresa),
      });
      const res = await fetch(`/api/queue/status/${ticket.uuid}?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: QueueStatus;
        error?: string;
        code?: string;
        hint?: string;
      };
      if (json.success && json.data) {
        setPollError("");
        setStatus(json.data);
        return;
      }
      const msg = [json.error, json.hint].filter(Boolean).join(" — ") || `Error ${res.status}`;
      setPollError(msg);
      if (res.status !== 403) {
        console.warn("[TicketConfirmation] poll no ok", res.status, json);
      }
    } catch (error) {
      console.error("[TicketConfirmation] poll error", error);
      setPollError("No se pudo actualizar el estado. Revisa la conexión.");
    }
  }, [ticket.uuid, queueSessionToken, userIdEmpresa, userRolIdEmpresa]);

  useQueueTicketStream(
    {
      queueSessionToken,
      userIdEmpresa,
      userRolIdEmpresa,
      enabled: queueSessionToken.length > 0,
    },
    (_payload) => {
      void pollStatus();
    },
    {
      onOpen: () => setTicketLive(true),
      onConnectionLost: () => setTicketLive(false),
    },
  );

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active) return;
      await pollStatus();
    };

    void poll();
    const id = setInterval(poll, ticketLive ? 25000 : 12000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pollStatus, ticketLive]);

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 250 }}
      className="w-full max-w-xl rounded-3xl border border-white/12 bg-white/[0.06] p-6 shadow-[0_20px_70px_-38px_rgba(91,135,218,0.95)] backdrop-blur-[16px]"
    >
      <div className="mb-6 flex justify-center">
        <GuachiLogo variant="white" width={160} height={40} />
      </div>
      <h2 className="mb-2 text-center text-2xl font-bold text-white">Ticket asignado</h2>
      <p className="mb-6 text-center text-slate-300">Espera la notificación para ser atendido.</p>

      <div className="mb-4 rounded-xl border border-sa-primary/35 bg-sa-primary/10 p-6 text-center">
        <p className="mb-2 text-sm text-slate-300">Número de turno</p>
        <motion.p
          animate={reduceMotion ? undefined : { scale: [1, 1.04, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1 }}
          className="text-6xl font-bold text-sa-primary-light"
        >
          {ticket.numero}
        </motion.p>
      </div>

      <div className="rounded-xl border border-white/12 bg-sa-secondary-dark/60 p-4">
        <p className="text-sm text-slate-400">Estado</p>
        <p className="text-lg font-semibold capitalize text-white">{status.estado}</p>
        <p className="mt-1 text-sm text-slate-300">{status.mensaje}</p>
        {pollError ? (
          <p className="mt-3 border-t border-white/10 pt-3 text-sm text-sa-state-error">
            {pollError}
          </p>
        ) : null}
      </div>
    </motion.section>
  );
}
