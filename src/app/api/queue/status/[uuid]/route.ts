/**
 * Estado del ticket: valida la sesión de cola del navegador (sin X-Internal-Key en la petición del cliente).
 * Hacia Centinela, `getQueueStatusForTicket` → `fetchQueueInfo` sí envía X-Internal-Key; un fallo upstream sería 502, no 403.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { z } from "zod";
import { assertQueueSessionAccess } from "@/lib/queue-qr-tokens";
import { getQueueStatusForTicket } from "@/lib/queue-status-adapter";

const QuerySchema = z.object({
  queueSessionToken: z.string().min(1),
  userIdEmpresa: z.coerce.number().int().positive(),
  userRolIdEmpresa: z.coerce.number().int().positive(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  if (!z.string().uuid().safeParse(uuid).success) {
    return NextResponse.json({ success: false, error: "UUID inválido" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = QuerySchema.safeParse(query);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Sesión y empresa requeridas" }, { status: 400 });
  }

  const session = await assertQueueSessionAccess(parsed.data.queueSessionToken, { ip, userAgent });
  if (!session) {
    console.warn("[queue/status] 403 sesión de cola inválida o expirada (IP/UA/hash Redis)", {
      uuid,
      ipPreview: ip.slice(0, 32),
    });
    return NextResponse.json(
      {
        success: false,
        error: "Sesión inválida o expirada",
        code: "QUEUE_SESSION_INVALID",
        hint: "La sesión de cola no coincide con este dispositivo o caducó. Vuelve a escanear el QR.",
      },
      { status: 403 },
    );
  }

  if (session.empresaId != null && session.empresaId !== parsed.data.userIdEmpresa) {
    console.warn("[queue/status] 403 empresa no coincide con el QR", {
      uuid,
      empresaIdSesion: session.empresaId,
      userIdEmpresaQuery: parsed.data.userIdEmpresa,
    });
    return NextResponse.json(
      {
        success: false,
        error: "Empresa no autorizada para esta sesión",
        code: "EMPRESA_QR_MISMATCH",
        hint: "El ticket es de otra empresa o el QR no incluye esta empresa.",
      },
      { status: 403 },
    );
  }

  try {
    const status = await getQueueStatusForTicket({
      ticketUuid: uuid,
      userEmpresaId: parsed.data.userIdEmpresa,
      userEmpresaRolId: parsed.data.userRolIdEmpresa,
    });
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error("[queue/status] upstream error", error);
    return NextResponse.json({ success: false, error: "No se pudo consultar el estado" }, { status: 502 });
  }
}
