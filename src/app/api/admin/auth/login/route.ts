import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limiter";
import { checkLoginRateLimit, createAdminSession, createAdminToken, verifyAdminPassword } from "@/lib/admin-auth";

const LoginSchema = z.object({
  password: z.string().min(1),
});

/** Duración de la cookie de sesión admin en segundos (8 horas). */
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const ipBurstLimit = checkRateLimit(`admin:login:burst:${ip}`, { maxRequests: 30, windowSeconds: 60 });
  if (!ipBurstLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiados intentos. Intenta luego." },
      { status: 429 },
    );
  }

  const limit = await checkLoginRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiados intentos. Intenta luego." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
  }

  const valid = await verifyAdminPassword(parsed.data.password);
  if (!valid) {
    return NextResponse.json({ success: false, error: "Credenciales inválidas" }, { status: 401 });
  }

  const token = createAdminToken();
  await createAdminSession(token);

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ success: true, expiresIn: SESSION_TTL_SECONDS });

  // Emitir el token como cookie HttpOnly para que no sea accesible desde JavaScript.
  // SameSite=Lax protege contra CSRF: el cookie se envía en navegación de primer nivel
  // pero no en peticiones cross-site iniciadas por terceros (p. ej. fetch desde otro dominio).
  response.cookies.set("admin_token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return response;
}
