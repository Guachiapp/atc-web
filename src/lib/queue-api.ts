import { z } from "zod";
import { sanitizeString } from "@/lib/request-validator";

const EmpresaUnidadSchema = z.object({
  user_id: z.number().int().positive(),
  user_rol_id: z.number().int().positive(),
  empresa: z.string(),
  ubicacion: z.string(),
  condominio_id: z.number().int().positive(),
});

const UnidadesResponseSchema = z.object({
  empresas_x_oficina: z.array(EmpresaUnidadSchema),
});

const TicketResponseSchema = z.object({
  uuid: z.string(),
  numero: z.number().int().nonnegative(),
  estado: z.enum(["pendiente", "llamado", "atendido", "cancelado"]).catch("pendiente"),
});

const DatosClienteResponseSchema = z.object({
  codigo: z.string().optional(),
  mensaje: z.string().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});

const QueueInfoRowSchema = z.object({
  id: z.number(),
  uuid: z.string().uuid(),
  numero: z.number(),
  estado: z.enum(["pendiente", "llamado", "atendido"]),
  fe_registro: z.string(),
  fe_llamada: z.string().nullable(),
  fe_fin: z.string().nullable(),
  nombre: z.string().nullable(),
  cedula: z.string().nullable(),
  telefono: z.string().nullable(),
  correo: z.string().nullable(),
});

const QueueInfoResponseSchema = z.object({
  codigo: z.string(),
  mensaje: z.string().optional(),
  result: z.array(QueueInfoRowSchema),
  error: z.unknown().nullable().optional(),
});

function getApiConfig() {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const internalKey = process.env.API_INTERNAL_KEY?.trim();
  if (!baseUrl || !internalKey) throw new Error("API env no configurada");
  return { baseUrl, internalKey };
}

/**
 * Cabeceras hacia Centinela. FastAPI recibe `x_internal_key` como `X-Internal-Key` / `x-internal-key`
 * (en HTTP los nombres son equivalentes). El 403 "No autorizado" también puede ser por IP no
 * permitida en el servidor (ALLOWED_IPS), no solo por clave incorrecta.
 */
function internalHeaders(internalKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Internal-Key": internalKey,
  };
}

/** Solo nombres de cabeceras y longitud del valor; `QUEUE_API_DEBUG_HEADERS=1` en .env.local */
function logOutgoingInternalHeadersDebug(operation: string, headerInit: HeadersInit) {
  if (process.env.QUEUE_API_DEBUG_HEADERS !== "1") return;
  const h = new Headers(headerInit);
  const keys = [...h.keys()];
  const v = h.get("x-internal-key");
  console.log(`${LOG} DEBUG ${operation} outgoing header names`, keys);
  console.log(`${LOG} DEBUG ${operation} x-internal-key: length=${v?.length ?? 0} (sin mostrar valor)`);
}

const LOG = "[queue-api]";

function apiOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "(NEXT_PUBLIC_API_BASE_URL inválida)";
  }
}

/** Metadatos del internal key sin exponer el secreto (solo longitud + prefijo). */
function internalKeyMeta(key: string): { present: boolean; length: number; prefix: string } {
  return {
    present: key.length > 0,
    length: key.length,
    prefix: key.length >= 4 ? `${key.slice(0, 4)}…` : "(corta)",
  };
}

function truncateBody(text: string, max = 4096): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [truncado ${text.length - max} chars]`;
}

function safeResponseHeaders(response: Response): Record<string, string> {
  try {
    return Object.fromEntries(response.headers.entries());
  } catch {
    return { error: "headers_no_legibles" };
  }
}

function logUpstreamFailure(
  operation: string,
  ctx: {
    requestUrl: string;
    apiOrigin: string;
    internalKey: ReturnType<typeof internalKeyMeta>;
    status?: number;
    statusText?: string;
    responseHeaders?: Record<string, string>;
    bodyText?: string;
    fetchError?: unknown;
    /** Preview del body enviado (POST), truncado; no incluir secretos. */
    requestDebug?: { method?: string; bodyPreview?: string };
  },
) {
  const payload = {
    operation,
    requestUrl: ctx.requestUrl,
    apiOrigin: ctx.apiOrigin,
    internalKey: ctx.internalKey,
    requestDebug: ctx.requestDebug,
    status: ctx.status,
    statusText: ctx.statusText,
    responseHeaders: ctx.responseHeaders,
    bodyText: ctx.bodyText ? truncateBody(ctx.bodyText) : undefined,
    ...(ctx.status === 403
      ? {
          diagnosticHint:
            "403 con detail genérico: validar INTERNAL_API_KEY en el servidor Y que la IP de salida del cliente esté en ALLOWED_IPS (validate_internal_access en api-centinela).",
        }
      : {}),
    fetchError:
      ctx.fetchError instanceof Error
        ? {
            name: ctx.fetchError.name,
            message: ctx.fetchError.message,
            cause: (ctx.fetchError as Error & { cause?: unknown }).cause,
          }
        : ctx.fetchError,
  };
  console.error(`${LOG} upstream failure`, JSON.stringify(payload, null, 2));
  if (ctx.fetchError && !(ctx.fetchError instanceof Error)) {
    console.error(`${LOG} fetchError (raw)`, ctx.fetchError);
  }
}

/** Fetch interno con cuerpo como texto: loguea fallos de red, HTTP !ok y opcionalmente el body enviado. */
async function internalFetchText(opts: {
  operation: string;
  requestUrl: string;
  init: RequestInit;
  requestBodyPreview?: string;
}): Promise<string> {
  const { baseUrl, internalKey } = getApiConfig();
  const origin = apiOrigin(baseUrl);
  const keyMeta = internalKeyMeta(internalKey);
  const method = (opts.init.method as string | undefined) || "GET";
  const requestDebug =
    opts.requestBodyPreview !== undefined
      ? { method, bodyPreview: truncateBody(opts.requestBodyPreview, 512) }
      : { method };

  const hdrs = opts.init.headers as HeadersInit | undefined;
  if (hdrs) logOutgoingInternalHeadersDebug(opts.operation, hdrs);

  let response: Response;
  try {
    response = await fetch(opts.requestUrl, opts.init);
  } catch (fetchError) {
    logUpstreamFailure(opts.operation, {
      requestUrl: opts.requestUrl,
      apiOrigin: origin,
      internalKey: keyMeta,
      fetchError,
      requestDebug,
    });
    throw fetchError;
  }

  const bodyText = await response.text();
  if (!response.ok) {
    logUpstreamFailure(opts.operation, {
      requestUrl: opts.requestUrl,
      apiOrigin: origin,
      internalKey: keyMeta,
      status: response.status,
      statusText: response.statusText,
      responseHeaders: safeResponseHeaders(response),
      bodyText,
      requestDebug,
    });
    throw new Error(`Upstream error ${response.status}: ${truncateBody(bodyText, 500)}`);
  }

  return bodyText;
}

export async function fetchQueueUnidades(condominioId: number) {
  const { baseUrl, internalKey } = getApiConfig();
  const requestUrl = `${baseUrl}/internal/empresa/queue/unidades?condominio_id=${condominioId}`;
  const origin = apiOrigin(baseUrl);
  const keyMeta = internalKeyMeta(internalKey);

  const headerInit = internalHeaders(internalKey);
  logOutgoingInternalHeadersDebug("fetchQueueUnidades", headerInit);

  let response: Response;
  try {
    response = await fetch(requestUrl, { headers: headerInit, cache: "no-store" });
  } catch (fetchError) {
    logUpstreamFailure("fetchQueueUnidades", {
      requestUrl,
      apiOrigin: origin,
      internalKey: keyMeta,
      fetchError,
      requestDebug: { method: "GET" },
    });
    throw fetchError;
  }

  const bodyText = await response.text();
  if (!response.ok) {
    logUpstreamFailure("fetchQueueUnidades", {
      requestUrl,
      apiOrigin: origin,
      internalKey: keyMeta,
      status: response.status,
      statusText: response.statusText,
      responseHeaders: safeResponseHeaders(response),
      bodyText,
      requestDebug: { method: "GET" },
    });
    throw new Error(`Upstream error ${response.status}: ${truncateBody(bodyText, 500)}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(bodyText) as unknown;
  } catch (parseError) {
    console.error(`${LOG} fetchQueueUnidades JSON parse error`, {
      requestUrl,
      bodyPreview: truncateBody(bodyText),
      parseError,
    });
    throw parseError;
  }

  const parsed = UnidadesResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`${LOG} fetchQueueUnidades schema mismatch`, {
      requestUrl,
      zodError: parsed.error.flatten(),
      bodyPreview: truncateBody(bodyText),
    });
    throw new Error("Respuesta de unidades con formato inesperado");
  }

  return parsed.data.empresas_x_oficina.map((item) => ({
    userId: item.user_id,
    userRolId: item.user_rol_id,
    empresa: sanitizeString(item.empresa),
    ubicacion: sanitizeString(item.ubicacion),
    condominioId: item.condominio_id,
  }));
}

export async function postGenerarTicket(params: {
  uuid: string;
  userIdEmpresa: number;
  userRolIdEmpresa: number;
}) {
  const { baseUrl, internalKey } = getApiConfig();
  const requestUrl = `${baseUrl}/internal/cliente/queue/generar-ticket`;
  const bodyStr = JSON.stringify({
    uuid: params.uuid,
    user_id_empresa: params.userIdEmpresa,
    user_rol_id_empresa: params.userRolIdEmpresa,
  });
  const bodyText = await internalFetchText({
    operation: "postGenerarTicket",
    requestUrl,
    init: { method: "POST", headers: internalHeaders(internalKey), body: bodyStr },
    requestBodyPreview: bodyStr,
  });
  const raw = JSON.parse(bodyText) as unknown;
  return TicketResponseSchema.parse(raw);
}

export async function postDatosCliente(
  uuid: string,
  body: { nombre?: string; cedula?: string; telefono?: string; correo?: string },
) {
  const { baseUrl, internalKey } = getApiConfig();
  const requestUrl = `${baseUrl}/internal/cliente/queue/datos-cliente/${uuid}`;
  const bodyStr = JSON.stringify(body);
  const bodyText = await internalFetchText({
    operation: "postDatosCliente",
    requestUrl,
    init: { method: "POST", headers: internalHeaders(internalKey), body: bodyStr },
    requestBodyPreview: bodyStr,
  });
  const raw = JSON.parse(bodyText) as unknown;
  return DatosClienteResponseSchema.parse(raw);
}

export async function fetchQueueInfo(params: {
  userEmpresaId: number;
  userEmpresaRolId: number;
  estado: "pendiente" | "llamado" | "atendido";
  limit: number;
}) {
  const { baseUrl, internalKey } = getApiConfig();
  const qs = new URLSearchParams({
    user_empresa_id: String(params.userEmpresaId),
    user_empresa_rol_id: String(params.userEmpresaRolId),
    estado: params.estado,
    limit: String(params.limit),
  });
  const requestUrl = `${baseUrl}/internal/cliente/queue/info?${qs.toString()}`;
  const bodyText = await internalFetchText({
    operation: "fetchQueueInfo",
    requestUrl,
    init: { headers: internalHeaders(internalKey), cache: "no-store" },
  });
  const raw = JSON.parse(bodyText) as unknown;
  const parsed = QueueInfoResponseSchema.parse(raw);
  if (parsed.codigo !== "00") {
    console.error(`${LOG} fetchQueueInfo codigo distinto de 00`, {
      codigo: parsed.codigo,
      mensaje: parsed.mensaje,
      bodyPreview: truncateBody(bodyText),
    });
    throw new Error(parsed.mensaje || "Consulta de cola rechazada");
  }
  return parsed.result;
}
