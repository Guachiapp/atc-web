import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { z } from "zod";
import { postDatosCliente } from "@/lib/queue-api";
import { assertQueueSessionAccess } from "@/lib/queue-qr-tokens";
import { sanitizeString } from "@/lib/request-validator";

const BodySchema = z.object({
  queueSessionToken: z.string().min(1),
  nombre: z.string().min(2).max(120).optional(),
  cedula: z.string().min(4).max(20).optional(),
  telefono: z.string().min(7).max(20).optional(),
  correo: z.string().email().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const { uuid } = await params;
  if (!z.string().uuid().safeParse(uuid).success) {
    return NextResponse.json({ success: false, error: "UUID inválido" }, { status: 400 });
  }

  const bodyRaw = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Payload inválido" }, { status: 400 });
  }

  const session = await assertQueueSessionAccess(parsed.data.queueSessionToken, { ip, userAgent });
  if (!session) {
    return NextResponse.json({ success: false, error: "Sesión inválida" }, { status: 403 });
  }

  try {
    const result = await postDatosCliente(uuid, {
      nombre: parsed.data.nombre ? sanitizeString(parsed.data.nombre) : undefined,
      cedula: parsed.data.cedula ? sanitizeString(parsed.data.cedula) : undefined,
      telefono: parsed.data.telefono ? sanitizeString(parsed.data.telefono) : undefined,
      correo: parsed.data.correo ? sanitizeString(parsed.data.correo) : undefined,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[queue/datos-cliente] upstream error", error);
    return NextResponse.json({ success: false, error: "No se pudo guardar datos del cliente" }, { status: 502 });
  }
}
