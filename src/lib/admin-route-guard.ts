import { NextRequest, NextResponse } from "next/server";
import { isAdminSessionValid } from "@/lib/admin-auth";

/**
 * Guard de autenticación para rutas de API admin.
 *
 * Lee el token de sesión admin desde la cookie HttpOnly `admin_token`.
 * Retorna null si la sesión es válida (el handler puede continuar),
 * o una NextResponse 401 si no hay sesión o es inválida.
 */
export async function requireAdminAuth(request: NextRequest): Promise<NextResponse | null> {
  const token = request.cookies.get("admin_token")?.value;

  if (!token) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  if (!(await isAdminSessionValid(token))) {
    return NextResponse.json({ success: false, error: "Sesión inválida o expirada" }, { status: 401 });
  }

  return null;
}
