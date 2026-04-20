import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { z } from "zod";
import { assertQueueSessionAccess } from "@/lib/queue-qr-tokens";
import { removeFcmToken } from "@/lib/push-token-store";

const BodySchema = z.object({
  queueSessionToken: z.string().min(1),
  userIdEmpresa: z.number().int().positive(),
  ticketUuid: z.string().uuid(),
  installId: z.string().min(8).max(128),
  fcmToken: z.string().min(80).max(4096).optional(),
});

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
      { success: false, error: "Sesión inválida o expirada", code: "QUEUE_SESSION_INVALID" },
      { status: 403 },
    );
  }

  if (session.empresaId != null && session.empresaId !== parsed.data.userIdEmpresa) {
    return NextResponse.json(
      { success: false, error: "Empresa no autorizada", code: "EMPRESA_MISMATCH" },
      { status: 403 },
    );
  }

  try {
    await removeFcmToken({
      installId: parsed.data.installId,
      ticketUuid: parsed.data.ticketUuid,
      fcmToken: parsed.data.fcmToken,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[push/fcm/unregister]", e);
    return NextResponse.json({ success: false, error: "No se pudo eliminar el token" }, { status: 500 });
  }
}
