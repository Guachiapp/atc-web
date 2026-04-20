import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendFcmToTokens, isFcmConfigured } from "@/lib/fcm-admin";
import { collectFcmTokensForTicket } from "@/lib/push-token-store";
import { requireInternalAuth } from "@/lib/internal-guard";

const BodySchema = z.object({
  ticketUuid: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
});

/**
 * Dispara notificación FCM a todos los tokens registrados para un `ticketUuid`.
 * Llamar desde Centinela, un worker Redis o proceso batch, con `X-Internal-Key`.
 */
export async function POST(request: NextRequest) {
  const authResponse = requireInternalAuth(request);
  if (authResponse) return authResponse;
  if (!isFcmConfigured()) {
    return NextResponse.json(
      { success: false, error: "FCM no configurado en el servidor", code: "FCM_DISABLED" },
      { status: 503 },
    );
  }

  const bodyRaw = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Payload inválido" }, { status: 400 });
  }

  try {
    const tokens = await collectFcmTokensForTicket(parsed.data.ticketUuid);
    if (tokens.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: "Sin tokens registrados" });
    }
    const data: Record<string, string> = {
      ticketUuid: parsed.data.ticketUuid,
      ...(parsed.data.data ?? {}),
    };
    const result = await sendFcmToTokens(tokens, { title: parsed.data.title, body: parsed.data.body }, data);
    return NextResponse.json({
      success: true,
      tokens: tokens.length,
      successCount: result.success,
      failureCount: result.failure,
    });
  } catch (e) {
    console.error("[internal/push/notify]", e);
    return NextResponse.json({ success: false, error: "Error al enviar FCM" }, { status: 500 });
  }
}
