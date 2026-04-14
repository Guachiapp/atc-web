import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceAdaptiveCaptcha } from "@/lib/adaptive-captcha";
import { checkRateLimit } from "@/lib/rate-limiter";
import { assertQueueSessionAccess } from "@/lib/queue-qr-tokens";
import { postGenerarTicket } from "@/lib/queue-api";
import { DeviceFingerprintSchema, saveDeviceQueueAssociation } from "@/lib/device-association";

const BodySchema = z.object({
  queueSessionToken: z.string().min(1),
  captchaToken: z.string().optional(),
  uuid: z.string().uuid(),
  userIdEmpresa: z.number().int().positive(),
  userRolIdEmpresa: z.number().int().positive(),
  device: DeviceFingerprintSchema,
});

const idempotencyStore = new Map<string, { expiresAt: number; result: unknown }>();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return NextResponse.json({ success: false, error: "Idempotency-Key requerido" }, { status: 400 });
  }

  const already = idempotencyStore.get(idempotencyKey);
  if (already && already.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, data: already.result });
  }

  const rlIp = checkRateLimit(`queue:ticket:ip:${ip}`, { maxRequests: 10, windowSeconds: 600 });
  if (!rlIp.allowed) {
    return NextResponse.json({ success: false, error: "Demasiados intentos desde esta red" }, { status: 429 });
  }

  const bodyRaw = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Payload inválido" }, { status: 400 });
  }

  const captcha = await enforceAdaptiveCaptcha({
    ip,
    userAgent,
    action: "ticket_generate",
    captchaToken: parsed.data.captchaToken,
  });
  if (!captcha.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: captcha.reason || "CAPTCHA requerido",
        captchaRequired: captcha.requiresCaptcha,
        riskScore: captcha.score,
      },
      { status: 403 },
    );
  }

  const session = await assertQueueSessionAccess(parsed.data.queueSessionToken, { ip, userAgent });
  if (!session) {
    return NextResponse.json({ success: false, error: "Sesión inválida" }, { status: 403 });
  }

  if (session.empresaId && session.empresaId !== parsed.data.userIdEmpresa) {
    return NextResponse.json({ success: false, error: "Empresa no autorizada para este QR" }, { status: 403 });
  }

  try {
    const ticket = await postGenerarTicket({
      uuid: parsed.data.uuid,
      userIdEmpresa: parsed.data.userIdEmpresa,
      userRolIdEmpresa: parsed.data.userRolIdEmpresa,
    });

    await saveDeviceQueueAssociation({
      device: parsed.data.device,
      ticket,
      condominioId: session.condominioId,
      empresaId: parsed.data.userIdEmpresa,
      userRolIdEmpresa: parsed.data.userRolIdEmpresa,
      ip,
      userAgent,
    });

    idempotencyStore.set(idempotencyKey, { expiresAt: Date.now() + IDEMPOTENCY_TTL_MS, result: ticket });
    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    console.error("[queue/generar-ticket] upstream error", error);
    return NextResponse.json({ success: false, error: "No se pudo generar el ticket" }, { status: 502 });
  }
}
