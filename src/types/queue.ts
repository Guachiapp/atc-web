export interface EmpresaUnidad {
  userId: number;
  userRolId: number;
  empresa: string;
  ubicacion: string;
  condominioId: number;
}

export interface QueueTicket {
  uuid: string;
  numero: number;
  estado: "pendiente" | "llamado" | "atendido" | "cancelado";
}

export interface DeviceFingerprint {
  installId: string;
  platform: string;
  language: string;
  timezone: string;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
}

export interface QueueStatus {
  estado: QueueTicket["estado"];
  mensaje: string;
  updatedAt: string;
}

/** Fila devuelta por GET /internal/cliente/queue/info */
export interface QueueInfoRow {
  id: number;
  uuid: string;
  numero: number;
  estado: "pendiente" | "llamado" | "atendido";
  fe_registro: string;
  fe_llamada: string | null;
  fe_fin: string | null;
  nombre: string | null;
  cedula: string | null;
  telefono: string | null;
  correo: string | null;
}

export interface QueueSnapshot {
  pendientes: QueueInfoRow[];
  llamados: QueueInfoRow[];
  atendidos: QueueInfoRow[];
}

/** Mensaje publicado en Redis `tickets_{userRolIdEmpresa}` (ej. al llamar turno desde taquilla). */
export interface QueueRedisNotification {
  type: string;
  uuid: string;
  numero: number;
  puesto?: string | number;
}

export interface DeviceQueueAssociation {
  ticket: QueueTicket;
  condominioId: number;
  empresaId: number;
  userRolIdEmpresa: number;
  linkedAt: string;
  ipHash: string;
  userAgentHash: string;
  deviceHash: string;
}

export interface QueueSessionPayload {
  queueSessionId: string;
  condominioId: number;
  empresaId: number | null;
  issuedAt: number;
  expiresAt: number;
}

export interface QREntryPayload {
  jti: string;
  scope: "queue:entry";
  condominioId: number;
  empresaId: number | null;
  issuedAt: number;
  expiresAt: number;
  kid: string;
  version: number;
}
