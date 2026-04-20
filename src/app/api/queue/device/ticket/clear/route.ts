import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { z } from "zod";
import { assertQueueSessionAccess } from "@/lib/queue-qr-tokens";
import {
  DeviceFingerprintSchema,
  deleteDeviceQueueAssociation,
  getDeviceQueueAssociation,
} from "@/lib/device-association";

const BodySchema = z.object({
  queueSessionToken: z.string().min(1),
  userIdEmpresa: z.number().int().positive(),
  ticketUuid: z.string().uuid(),
  device: DeviceFingerprintSchema,
});

/**
 * Quita la asociación Redis dispositivo ↔ ticket para que un nuevo escaneo de QR
 * permita generar otro turno (tras atención completada).
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const bodyRaw = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Payload inválido" }, { status: 400 });
  }

  const session = await assertQueueSessionAccess(parsed.data.queueSessionToken, { ip, userAgent });
  if (!session) {
    return NextResponse.json(
      {
        success: false,
        error: "Sesión inválida o expirada",
        code: "QUEUE_SESSION_INVALID",
      },
      { status: 403 },
    );
  }

  if (session.empresaId != null && session.empresaId !== parsed.data.userIdEmpresa) {
    return NextResponse.json(
      { success: false, error: "Empresa no autorizada para este QR", code: "EMPRESA_QR_MISMATCH" },
      { status: 403 },
    );
  }

  try {
    const assoc = await getDeviceQueueAssociation({
      device: parsed.data.device,
      condominioId: session.condominioId,
      empresaId: parsed.data.userIdEmpresa,
    });
    if (!assoc) {
      return NextResponse.json({ success: true, data: { cleared: false } });
    }
    if (assoc.ticket.uuid !== parsed.data.ticketUuid) {
      return NextResponse.json(
        { success: false, error: "El turno no coincide con este dispositivo", code: "TICKET_MISMATCH" },
        { status: 403 },
      );
    }
    await deleteDeviceQueueAssociation({
      device: parsed.data.device,
      condominioId: session.condominioId,
      empresaId: parsed.data.userIdEmpresa,
    });
    return NextResponse.json({ success: true, data: { cleared: true } });
  } catch (error) {
    console.error("[queue/device/ticket/clear] error", error);
    return NextResponse.json(
      { success: false, error: "No se pudo liberar el turno del dispositivo" },
      { status: 500 },
    );
  }
}
