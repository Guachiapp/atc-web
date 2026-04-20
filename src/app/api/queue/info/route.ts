import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { z } from "zod";
import { assertQueueSessionAccess } from "@/lib/queue-qr-tokens";
import { fetchQueueInfo } from "@/lib/queue-api";
import { evaluateEnumeration } from "@/lib/anti-enumeration";

const QuerySchema = z.object({
  queueSessionToken: z.string().min(1),
  userIdEmpresa: z.coerce.number().int().positive(),
  userRolIdEmpresa: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = QuerySchema.safeParse(query);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Parámetros inválidos" }, { status: 400 });
  }

  const session = await assertQueueSessionAccess(parsed.data.queueSessionToken, { ip, userAgent });
  if (!session) {
    return NextResponse.json({ success: false, error: "Sesión inválida" }, { status: 403 });
  }

  if (session.empresaId && session.empresaId !== parsed.data.userIdEmpresa) {
    return NextResponse.json({ success: false, error: "Empresa no autorizada para este acceso" }, { status: 403 });
  }

  const antiEnum = await evaluateEnumeration(ip, session.condominioId);
  if (!antiEnum.allowed) {
    return NextResponse.json({ success: false, error: "Acceso bloqueado" }, { status: 429 });
  }

  const limit = parsed.data.limit;
  try {
    const [pendientes, llamados, atendidos] = await Promise.all([
      fetchQueueInfo({
        userEmpresaId: parsed.data.userIdEmpresa,
        userEmpresaRolId: parsed.data.userRolIdEmpresa,
        estado: "pendiente",
        limit,
      }),
      fetchQueueInfo({
        userEmpresaId: parsed.data.userIdEmpresa,
        userEmpresaRolId: parsed.data.userRolIdEmpresa,
        estado: "llamado",
        limit,
      }),
      fetchQueueInfo({
        userEmpresaId: parsed.data.userIdEmpresa,
        userEmpresaRolId: parsed.data.userRolIdEmpresa,
        estado: "atendido",
        limit,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        pendientes,
        llamados,
        atendidos,
      },
    });
  } catch (error) {
    console.error("[queue/info] upstream error", error);
    return NextResponse.json({ success: false, error: "No se pudo consultar la cola" }, { status: 502 });
  }
}
