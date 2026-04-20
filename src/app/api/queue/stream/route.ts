import { NextRequest } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { z } from "zod";
import { evaluateEnumeration } from "@/lib/anti-enumeration";
import { assertQueueSessionAccess } from "@/lib/queue-qr-tokens";
import { createQueueTicketSubscriber } from "@/lib/redis-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  queueSessionToken: z.string().min(1),
  userIdEmpresa: z.coerce.number().int().positive(),
  userRolIdEmpresa: z.coerce.number().int().positive(),
});

function sseEncode(event: string, data: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`event: ${event}\ndata: ${data}\n\n`);
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = QuerySchema.safeParse(query);
  if (!parsed.success) {
    return new Response(JSON.stringify({ success: false, error: "Parámetros inválidos" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = await assertQueueSessionAccess(parsed.data.queueSessionToken, { ip, userAgent });
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: "Sesión inválida" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (session.empresaId && session.empresaId !== parsed.data.userIdEmpresa) {
    return new Response(JSON.stringify({ success: false, error: "Empresa no autorizada para este acceso" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const antiEnum = await evaluateEnumeration(ip, session.condominioId);
  if (!antiEnum.allowed) {
    return new Response(JSON.stringify({ success: false, error: "Acceso bloqueado" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sub = createQueueTicketSubscriber();
  if (!sub) {
    return new Response(JSON.stringify({ success: false, error: "Tiempo real no disponible (Redis)" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const channel = `tickets_${parsed.data.userRolIdEmpresa}`;
  const encoder = new TextEncoder();

  let teardown: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let closed = false;

      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(sseEncode("message", JSON.stringify(obj)));
        } catch {
          /* stream closed */
        }
      };

      const onRedisMessage = (_ch: string, message: string) => {
        try {
          const payload = JSON.parse(message) as Record<string, unknown>;
          send({ channel: "queue", payload });
        } catch {
          send({ channel: "queue", raw: message });
        }
      };

      const onRedisError = (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[queue/stream] redis subscriber error", err);
        send({
          channel: "system",
          type: "REDIS_ERROR",
          error: message,
        });
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        try {
          sub.removeListener("message", onRedisMessage);
          sub.removeListener("error", onRedisError);
          void sub.unsubscribe(channel).catch(() => {});
          sub.quit().catch(() => {});
        } catch {
          /* ignore */
        }
      };

      teardown = cleanup;

      try {
        if (sub.status === "wait" || sub.status === "connecting" || sub.status === "reconnecting") {
          await sub.connect();
        }
        await sub.subscribe(channel);
        sub.on("message", onRedisMessage);
        sub.on("error", onRedisError);
        send({
          channel: "system",
          type: "SUBSCRIBED",
          redisChannel: channel,
        });
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
          } catch {
            cleanup();
          }
        }, 25000);
      } catch (error) {
        console.error("[queue/stream] subscribe failed", error);
        send({
          channel: "system",
          type: "ERROR",
          error: error instanceof Error ? error.message : "subscribe_failed",
        });
        cleanup();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
        return;
      }

      request.signal.addEventListener(
        "abort",
        () => {
          cleanup();
          try {
            controller.close();
          } catch {
            /* ignore */
          }
        },
        { once: true },
      );
    },
    cancel() {
      teardown?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
