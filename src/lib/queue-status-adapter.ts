import type { QueueStatus } from "@/types/queue";
import { fetchQueueInfo } from "@/lib/queue-api";

const INFO_LIMIT = 80;

export async function getQueueStatusForTicket(params: {
  ticketUuid: string;
  userEmpresaId: number;
  userEmpresaRolId: number;
}): Promise<QueueStatus> {
  const [pendiente, llamado, atendido] = await Promise.all([
    fetchQueueInfo({
      userEmpresaId: params.userEmpresaId,
      userEmpresaRolId: params.userEmpresaRolId,
      estado: "pendiente",
      limit: INFO_LIMIT,
    }),
    fetchQueueInfo({
      userEmpresaId: params.userEmpresaId,
      userEmpresaRolId: params.userEmpresaRolId,
      estado: "llamado",
      limit: INFO_LIMIT,
    }),
    fetchQueueInfo({
      userEmpresaId: params.userEmpresaId,
      userEmpresaRolId: params.userEmpresaRolId,
      estado: "atendido",
      limit: INFO_LIMIT,
    }),
  ]);

  const row = [...pendiente, ...llamado, ...atendido].find((r) => r.uuid === params.ticketUuid);
  if (!row) {
    return {
      estado: "pendiente",
      mensaje: "Sincronizando estado de tu turno…",
      updatedAt: new Date().toISOString(),
    };
  }

  const mensajes: Record<typeof row.estado, string> = {
    pendiente: "Tu turno está en espera.",
    llamado: "Te están llamando en taquilla.",
    atendido: "Tu atención ha finalizado.",
  };

  return {
    estado: row.estado,
    mensaje: mensajes[row.estado],
    updatedAt: row.fe_fin || row.fe_llamada || row.fe_registro,
  };
}
