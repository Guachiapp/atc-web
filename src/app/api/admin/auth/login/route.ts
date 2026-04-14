import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limiter";
import { checkLoginRateLimit, createAdminSession, createAdminToken, verifyAdminPassword } from "@/lib/admin-auth";

const LoginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
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

  const valid = verifyAdminPassword(parsed.data.password);
  if (!valid) {
    return NextResponse.json({ success: false, error: "Credenciales inválidas" }, { status: 401 });
  }

  const token = createAdminToken();
  await createAdminSession(token);
  return NextResponse.json({ success: true, token, expiresIn: 8 * 60 * 60 });
}
