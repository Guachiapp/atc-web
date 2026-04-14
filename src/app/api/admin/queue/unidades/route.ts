import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin-route-guard";
import { fetchQueueUnidades } from "@/lib/queue-api";

const QuerySchema = z.object({
  condominioId: z.coerce.number().int().positive(),
});

/**
 * Lista empresas/taquillas por condominio (mismo upstream que el flujo público).
 * Requiere sesión admin; la clave X-Internal-Key hacia Centinela solo existe en servidor.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (auth) return auth;

  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = QuerySchema.safeParse(query);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "condominioId inválido o requerido" }, { status: 400 });
  }

  try {
    const empresasPorOficina = await fetchQueueUnidades(parsed.data.condominioId);
    return NextResponse.json({
      success: true,
      data: { empresasPorOficina },
    });
  } catch (error) {
    console.error("[admin/queue/unidades] upstream error", error);
    return NextResponse.json(
      { success: false, error: "No se pudo consultar empresas en el API" },
      { status: 502 },
    );
  }
}
