import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limiter";
import { enforceAdaptiveCaptcha } from "@/lib/adaptive-captcha";
import { issueQueueSession, validateQREntryToken } from "@/lib/queue-qr-tokens";

const Schema = z.object({
  token: z.string().min(1),
  captchaToken: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const limit = checkRateLimit(`queue:init:${ip}`, { maxRequests: 20, windowSeconds: 300 });
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: "Límite de intentos excedido" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Token requerido" }, { status: 400 });
  }

  const captcha = await enforceAdaptiveCaptcha({
    ip,
    userAgent,
    action: "session_init",
    captchaToken: parsed.data.captchaToken,
  });
  if (!captcha.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: captcha.reason || "Validación adicional requerida",
        captchaRequired: captcha.requiresCaptcha,
        riskScore: captcha.score,
      },
      { status: 403 },
    );
  }

  const qrPayload = await validateQREntryToken(parsed.data.token);
  if (!qrPayload) {
    return NextResponse.json({ success: false, error: "QR inválido o expirado" }, { status: 403 });
  }

  const { queueSessionToken } = await issueQueueSession({
    condominioId: qrPayload.condominioId,
    empresaId: qrPayload.empresaId,
    ip,
    userAgent,
  });

  return NextResponse.json({
    success: true,
    data: {
      queueSessionToken,
      condominioId: qrPayload.condominioId,
      empresaId: qrPayload.empresaId,
    },
  });
}
