import { NextRequest, NextResponse } from "next/server";

/**
 * Guard de autenticación para endpoints internos (comunicación server-to-server).
 *
 * Utiliza una clave estática `API_INTERNAL_KEY` definida en las variables de entorno.
 * Esta clave siempre debe existir en producción.
 *
 * @param request El request de NextJS a validar
 * @returns NextResponse con error 401 si no está autorizado, o null si el acceso es válido.
 */
export function requireInternalAuth(request: NextRequest): NextResponse | null {
  const expectedKey = process.env.API_INTERNAL_KEY?.trim();
  
  if (!expectedKey) {
    console.error("[internal-guard] API_INTERNAL_KEY no está configurada. Denegando acceso interno por seguridad.");
    return NextResponse.json({ success: false, error: "Internal Auth no configurada" }, { status: 503 });
  }

  const providedKey = request.headers.get("x-internal-key")?.trim() || request.headers.get("authorization")?.replace("Bearer ", "").trim();

  if (!providedKey || providedKey !== expectedKey) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  return null;
}
