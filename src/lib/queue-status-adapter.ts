import type { QueueInfoRow, QueueStatus, QueueStatusColaContext } from "@/types/queue";
import { fetchQueueInfo } from "@/lib/queue-api";

const INFO_LIMIT = 80;

function sortFifoPending(rows: QueueInfoRow[]): QueueInfoRow[] {
  return [...rows].sort(
    (a, b) => new Date(a.fe_registro).getTime() - new Date(b.fe_registro).getTime(),
  );
}

function buildColaContext(
  pendiente: QueueInfoRow[],
  llamado: QueueInfoRow[],
  row: QueueInfoRow,
): QueueStatusColaContext | undefined {
  const fifo = sortFifoPending(pendiente);
  const idx = fifo.findIndex((r) => r.uuid === row.uuid);
  const personasAntes = row.estado === "pendiente" && idx >= 0 ? idx : 0;
  const posicionEnFila = row.estado === "pendiente" && idx >= 0 ? idx + 1 : 0;

  const numerosEnLlamado = [...llamado]
    .sort((a, b) => {
      const ta = a.fe_llamada ? new Date(a.fe_llamada).getTime() : 0;
      const tb = b.fe_llamada ? new Date(b.fe_llamada).getTime() : 0;
      return tb - ta;
    })
    .map((r) => r.numero);

  return {
    personasAntes: row.estado === "pendiente" ? personasAntes : 0,
    posicionEnFila: row.estado === "pendiente" ? posicionEnFila : 1,
    totalEnEspera: pendiente.length,
    numerosEnLlamado,
  };
}

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
    pendiente: "Tu turno está en la fila de espera.",
    llamado: "Pasá a taquilla cuando te indiquen.",
    atendido: "Gracias por tu visita.",
  };

  const cola = buildColaContext(pendiente, llamado, row);

  return {
    estado: row.estado,
    mensaje: mensajes[row.estado],
    updatedAt: row.fe_fin || row.fe_llamada || row.fe_registro,
    cola,
  };
}
