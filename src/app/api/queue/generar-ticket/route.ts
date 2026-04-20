import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { z } from "zod";
import { enforceAdaptiveCaptcha } from "@/lib/adaptive-captcha";
import { checkRateLimit } from "@/lib/rate-limiter";
import { assertQueueSessionAccess } from "@/lib/queue-qr-tokens";
import { postGenerarTicket } from "@/lib/queue-api";
import { DeviceFingerprintSchema, saveDeviceQueueAssociation } from "@/lib/device-association";
import { rtGet, rtSetEx, rtSetNxEx } from "@/lib/redis-runtime";

const BodySchema = z.object({
  queueSessionToken: z.string().min(1),
  captchaToken: z.string().optional(),
  uuid: z.string().uuid(),
  userIdEmpresa: z.number().int().positive(),
  userRolIdEmpresa: z.number().int().positive(),
  device: DeviceFingerprintSchema,
});

/** TTL en segundos para la clave de idempotencia en Redis (10 minutos). */
const IDEMPOTENCY_TTL_SECONDS = 10 * 60;

function idempotencyKey(key: string): string {
  return `atc:idem:ticket:${key}`;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    getClientIp(request)
    "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  const rawIdempotencyKey = request.headers.get("Idempotency-Key");
  if (!rawIdempotencyKey) {
    return NextResponse.json({ success: false, error: "Idempotency-Key requerido" }, { status: 400 });
  }

  const redisIdemKey = idempotencyKey(rawIdempotencyKey);

  try {
    // Verificar idempotencia de manera atómica en Redis.
    // Si Redis no está disponible y está configurado en producción, esta llamada lanzará un error.
    const isFirstAttempt = await rtSetNxEx(`${redisIdemKey}:lock`, 30, "processing");

    if (!isFirstAttempt) {
      // Puede haber una respuesta cacheada si el primer intento ya terminó.
      const cached = await rtGet(`${redisIdemKey}:result`);
      if (cached) {
        try {
          return NextResponse.json({ success: true, data: JSON.parse(cached) });
        } catch {
          // Si el cache está corrupto, seguimos adelante.
        }
      }
      // El primer request aún está en vuelo — devolver 409 para que el cliente reintente.
      return NextResponse.json(
        { success: false, error: "Request duplicado en proceso. Intenta en unos segundos." },
        { status: 409 },
      );
    }

  } catch (error) {
    // Captura fallos críticos como la indisponibilidad de Redis (fail-fast persistencia).
    console.error("[queue/generar-ticket] Redis idempotency check failed", error);
    return NextResponse.json(
      { success: false, error: "Servicio temporalmente no disponible (503)" },
      { status: 503 }
    );
  }

  const rlIp = await checkRateLimit(`queue:ticket:ip:${ip}`, { maxRequests: 10, windowSeconds: 600 });
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

    // Cachear resultado para futuras peticiones con la misma Idempotency-Key.
    await rtSetEx(`${redisIdemKey}:result`, IDEMPOTENCY_TTL_SECONDS, JSON.stringify(ticket));

    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    console.error("[queue/generar-ticket] upstream error", error);
    return NextResponse.json({ success: false, error: "No se pudo generar el ticket" }, { status: 502 });
  }
}
