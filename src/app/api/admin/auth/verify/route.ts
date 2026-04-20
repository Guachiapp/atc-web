import { NextRequest, NextResponse } from "next/server";
import { isAdminSessionValid } from "@/lib/admin-auth";

/**
 * GET /api/admin/auth/verify
 *
 * Verifica la sesión de administrador leyendo el token desde la cookie HttpOnly `admin_token`.
 * No requiere body — el navegador envía la cookie automáticamente en cada request al mismo origen.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("admin_token")?.value;
  if (!token) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }
  const valid = await isAdminSessionValid(token);
  return NextResponse.json({ valid }, { status: valid ? 200 : 401 });
}
