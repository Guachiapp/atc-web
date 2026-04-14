import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertQueueSessionAccess } from "@/lib/queue-qr-tokens";
import { DeviceFingerprintSchema, getDeviceQueueAssociation } from "@/lib/device-association";

const BodySchema = z.object({
  queueSessionToken: z.string().min(1),
  userIdEmpresa: z.number().int().positive(),
  device: DeviceFingerprintSchema,
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
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
      return NextResponse.json({ success: true, data: null });
    }
    return NextResponse.json({
      success: true,
      data: {
        ticket: assoc.ticket,
        linkedAt: assoc.linkedAt,
      },
    });
  } catch (error) {
    console.error("[queue/device/ticket/current] error", error);
    return NextResponse.json({ success: false, error: "No se pudo consultar ticket del dispositivo" }, { status: 500 });
  }
}
