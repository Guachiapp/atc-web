import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertQueueSessionAccess } from "@/lib/queue-qr-tokens";
import { fetchQueueUnidades } from "@/lib/queue-api";
import { evaluateEnumeration } from "@/lib/anti-enumeration";

const QuerySchema = z.object({
  queueSessionToken: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = QuerySchema.safeParse(query);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Sesión requerida" }, { status: 400 });
  }

  const session = await assertQueueSessionAccess(parsed.data.queueSessionToken, { ip, userAgent });
  if (!session) {
    return NextResponse.json({ success: false, error: "Sesión inválida" }, { status: 403 });
  }

  const antiEnum = evaluateEnumeration(ip, session.condominioId);
  if (!antiEnum.allowed) {
    return NextResponse.json({ success: false, error: "Acceso bloqueado" }, { status: 429 });
  }

  try {
    console.log("[queue/unidades] calling upstream", {
      condominioId: session.condominioId,
      empresaIdFromQr: session.empresaId,
      ip,
      userAgentPreview: userAgent.slice(0, 120),
    });
    const unidades = await fetchQueueUnidades(session.condominioId);
    const filtered = session.empresaId
      ? unidades.filter((row) => row.userId === session.empresaId)
      : unidades;

    console.log("[queue/unidades] success", {
      condominioId: session.condominioId,
      total: unidades.length,
      afterQrFilter: filtered.length,
    });

    return NextResponse.json({
      success: true,
      data: { empresasPorOficina: filtered },
    });
  } catch (error) {
    console.error("[queue/unidades] upstream error", {
      condominioId: session.condominioId,
      empresaIdFromQr: session.empresaId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, error: "No se pudo consultar empresas" }, { status: 502 });
  }
}
