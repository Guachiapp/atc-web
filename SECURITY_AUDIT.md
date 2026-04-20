# Security Audit — guachi-atc-web

Auditoría de seguridad basada en el código fuente (Next.js 16 App Router) y en las versiones declaradas en `package.json` (última revisión: 2026-04-20).

> Ámbito: carpeta `guachi-atc-web/` (BFF público + portal admin + integración Centinela/Redis/FCM). No se audita el upstream `api-centinela`, pero se referencia cuando procede.

## Resumen ejecutivo

| Severidad | Cantidad |
|---|---|
| Crítica | 3 |
| Alta | 7 |
| Media | 9 |
| Baja | 7 |
| Dependencias (npm audit) | 8 (low) |

## 1. Hallazgos críticos

### C1. Hash de contraseña admin con HMAC-SHA256 sin salting ni KDF
Archivo: `src/lib/admin-auth.ts:10-22`.

```ts path=/Users/desarrollo/Workspace/guachi-atc-web/src/lib/admin-auth.ts start=10
function hashRawPassword(password: string): string {
  return createHmac("sha256", getSecret()).update(password).digest("hex");
}
```

- `ADMIN_PASSWORD_HASH` es una HMAC rápida (miles de millones de intentos/s en GPU).
- No hay salt por usuario ni factor de coste (argon2/bcrypt/scrypt).
- El mismo `SESSION_SECRET` firma tokens de sesión **y** deriva el hash → la fuga de `SESSION_SECRET` + `ADMIN_PASSWORD_HASH` permite crackeo offline trivial y forjado de tokens admin.

Mitigación: migrar a `argon2id` (p. ej. `argon2` o `@node-rs/argon2`) con salt único por cuenta; separar el secreto de firma de tokens del material de derivación de password; idealmente, soportar múltiples cuentas con tabla dedicada.

### C2. Fallback de `SESSION_SECRET` con cadena predecible
Archivo: `src/lib/admin-auth.ts:6-8`, `src/lib/queue-qr-tokens.ts:8-14`.

```ts path=/Users/desarrollo/Workspace/guachi-atc-web/src/lib/admin-auth.ts start=6
function getSecret(): string {
  return process.env.SESSION_SECRET || "CHANGE_THIS_IN_PRODUCTION";
}
```

Si la variable no está definida (despliegue mal configurado, recovery en nodo nuevo, migración), **todos** los tokens de sesión, QR de entrada y sesión de cola quedan firmables por cualquiera. Además, no hay `process.exit` ni error "fail-fast" en arranque.

Mitigación: fallar con error en startup si falta `SESSION_SECRET` o `QR_TOKEN_SECRET` en `NODE_ENV=production`. Añadir validación con Zod en un módulo `env.ts`.

### C3. Token de admin en `localStorage` (extraíble por XSS)
Archivo: `src/app/admin/queue-qr-generator/page.tsx:17-27` y componentes login.

- `localStorage.getItem("admin_token")` → cualquier XSS extrae y exfiltra el bearer de 8 horas.
- La CSP permite `script-src 'self' 'unsafe-inline'` → un XSS es más viable (ver H1).
- No hay binding del token al navegador/IP/UA ni rotación automática.

Mitigación: usar cookie `HttpOnly`, `Secure`, `SameSite=Lax`/`Strict`, refresco corto, y fingerprint (UA/IP hash) validado en Redis igual que `queue-session`.

## 2. Hallazgos altos

### H1. CSP con `'unsafe-inline'` en `script-src` y `style-src`
Archivo: `src/lib/security-headers.ts:8-17`.

```ts path=/Users/desarrollo/Workspace/guachi-atc-web/src/lib/security-headers.ts start=8
"Content-Security-Policy": [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  ...
].join("; "),
```

- `unsafe-inline` anula la principal defensa contra XSS reflejado/almacenado.
- Combinada con C3, convierte cualquier XSS en toma completa de sesión admin.
- No hay `nonce` ni `strict-dynamic`.

Mitigación: emplear `nonce` por request (inyectado desde `proxy.ts`) y eliminar `'unsafe-inline'`. Para estilos, usar `hash-source` de Tailwind/next o CSS estático.

### H2. Stores en memoria (idempotencia, rate-limit, anti-enumeración)
Archivos:
- `src/lib/rate-limiter.ts:1-32` (`Map<string, Bucket>` sin cleanup)
- `src/app/api/queue/generar-ticket/route.ts:18-19` (`idempotencyStore`)
- `src/lib/anti-enumeration.ts:1-4`

Riesgos:
- **DoS por memoria**: el `Map` crece indefinidamente; un atacante con IPs variables (proxy rotator) consume RAM hasta `max_memory_restart: 1G` y provoca reinicios (`ecosystem.config.cjs:30`).
- **Evasión en multi-réplica**: PM2 actualmente es `instances: 1, exec_mode: "fork"`, pero cualquier escalado horizontal rompe los límites.
- **Pérdida tras restart**: al reiniciar PM2 (10 reintentos configurados), se resetean contadores de login/tickets/enumeración → brute-force con reboot forzado.
- **Race condition en idempotencia**: el `get`/`set` no es atómico, dos requests concurrentes pueden pasar el check antes del `set` → **doble ticket generado**.

Mitigación: mover todo al `rate-limiter.ts` basado en Redis (usar `rtIncrWithExpiry`) con cleanup; para idempotencia usar `rtSetNxEx` (ya existe).

### H3. Fallback silencioso Redis → memoria
Archivo: `src/lib/redis-runtime.ts:55-65`.

```ts path=/Users/desarrollo/Workspace/guachi-atc-web/src/lib/redis-runtime.ts start=55
async function withRedis<T>(action, fallback) {
  const redis = getRedisClient();
  if (!redis) return fallback();
  try {
    ...
  } catch (error) {
    console.error("[redis-runtime] Redis operation failed, using memory fallback", error);
    return fallback();
  }
}
```

Consecuencias en fallo transitorio de Redis:
- **Revocación de QR tokens `atc:qr:revoked:{jti}` se pierde** → un QR comprometido revocado puede volver a validarse durante la caída (TTL real del QR = 365 días).
- **`checkLoginRateLimit` se pierde** → brute-force de admin sin tope global.
- **Sesiones de cola se pueden emitir** pero no compartir entre réplicas.
- No hay `/healthz` ni circuit-breaker que marque la app como degradada.

Mitigación: degradar explícitamente (`503`) para endpoints sensibles (login, revoke QR, session init) si Redis no está disponible; exponer métrica.

### H4. TTL de QR = 365 días
Archivo: `src/lib/queue-qr-tokens.ts:6`.

```ts path=/Users/desarrollo/Workspace/guachi-atc-web/src/lib/queue-qr-tokens.ts start=6
const QR_TTL_MS = 365 * 24 * 60 * 60 * 1000;
```

Un QR impreso o fotografiado por terceros otorga entrada a la cola de ese condominio/empresa durante **un año**. La única revocación es vía `revokeQREntryToken` (sujeto a H3). No hay rotación por `kid`.

Mitigación: TTL máximo razonable (p. ej. 90 días) + rotación obligatoria de `QR_ACTIVE_KID`, generación de QR por corto plazo bajo demanda para recepción.

### H5. Bypass de CAPTCHA con literal `"dev-bypass"` fuera de producción
Archivo: `src/lib/adaptive-captcha.ts:10-14`.

```ts path=/Users/desarrollo/Workspace/guachi-atc-web/src/lib/adaptive-captcha.ts start=10
async function verifyTurnstileToken(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return process.env.NODE_ENV !== "production" && token === "dev-bypass";
  }
  ...
}
```

Si en un entorno de staging/preprod se olvida `TURNSTILE_SECRET_KEY` **y** `NODE_ENV` distinto de `production`, el captcha se salta con una cadena fija trivial. En particular, si `pm2` se levanta sin `--env production`, `NODE_ENV` puede ser `undefined`.

Mitigación: eliminar el bypass literal y apoyar flag explícita `CAPTCHA_TEST_BYPASS=1` documentada; o bien require secret en cualquier entorno.

### H6. `x-forwarded-for` confiado sin configuración de proxies
Archivos: varios (`src/app/api/**/route.ts`, `proxy.ts`).

```ts path=/Users/desarrollo/Workspace/guachi-atc-web/src/app/api/admin/auth/login/route.ts start=11
const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
```

Sin declarar `trusted proxies` (Next no lo hace por sí mismo) un cliente puede enviar `X-Forwarded-For: 1.2.3.4` y:
- Saltar `checkLoginRateLimit` (rotando IPs falsas).
- Saltar `anti-enumeration` (cada IP espoofada es un bucket nuevo).
- Saltar el rate-limit del `proxy.ts` (middleware).

Esto es crítico **si** la app se expone directamente sin Nginx/Cloudflare. PM2 en el VPS escucha en 3010 (`ecosystem.config.cjs`), así que hay reverse proxy — pero la app no valida el origen de la cabecera.

Mitigación: leer IP desde `request.headers.get("cf-connecting-ip")` o `x-real-ip`, o derivar en Nginx (`proxy_set_header X-Real-IP $remote_addr;` + `X-Forwarded-For`). Documentar en README la dependencia.

### H7. `/api/internal/push/notify` accesible en Internet sin rate-limit propio
Archivo: `src/app/api/internal/push/notify/route.ts:6-27`.

- Única protección: `API_INTERNAL_KEY` (shared secret) en cabecera.
- Sin rate-limit específico (solo el genérico del middleware).
- Sin lista de IPs permitidas (a diferencia de Centinela que sí valida `ALLOWED_IPS` según comentario en `queue-api.ts:139`).
- Si la clave se filtra (logs, env mal protegida, config PM2), un atacante puede spamear FCM a cualquier `ticketUuid` → phishing móvil.

Mitigación: restringir el endpoint por IP (allowlist Redis/env) o por `express-ipfilter`-like; añadir rate-limit distintivo para endpoints "internos"; auditar loggers para asegurar que nunca se registra `x-internal-key`.

## 3. Hallazgos medios

### M1. `X-XSS-Protection: 1; mode=block` es obsoleta y potencialmente dañina
`src/lib/security-headers.ts:6`. Los navegadores modernos la ignoran; en Chrome legacy activa heurísticos que provocan XS-Leaks. Se recomienda `X-XSS-Protection: 0` y confiar en CSP.

### M2. CSP `connect-src 'self' https:` demasiado permisiva
`src/lib/security-headers.ts:13`. Un atacante que logre inyectar script puede exfiltrar datos a cualquier HTTPS. Restringir a dominios concretos: `https://*.guachiapp.com https://fcm.googleapis.com https://firebaseinstallations.googleapis.com https://firebase.googleapis.com https://challenges.cloudflare.com` etc.

### M3. CSP sin `object-src 'none'`, `upgrade-insecure-requests`, `worker-src`, `manifest-src`
Hay fallback implícito a `default-src`, pero es más seguro declarar explícitamente `object-src 'none'` y `upgrade-insecure-requests`, y limitar `worker-src 'self'` (existe `/sw.js`).

### M4. HSTS solo en producción
`src/lib/security-headers.ts:20-22`. Si `NODE_ENV` no se fija en un entorno prod "sin-docker", no hay HSTS → downgrade. Preferible aplicar siempre salvo bandera explícita de desactivación en dev.

### M5. `idempotencyStore` in-memory con race condition de doble ticket
Ver H2 + condición de carrera. Dos POST simultáneos con el mismo `Idempotency-Key` pasan el check `!already || already.expiresAt < now` antes del `set` y ambos acaban generando ticket en Centinela (y asociación en Redis).

### M6. Falta validación `Content-Type: application/json`
Las rutas hacen `await request.json()` sin comprobar Content-Type. No es una vulnerabilidad directa, pero facilita CSRF en navegadores que permiten enviar JSON vía `<form enctype="text/plain">`. Dado que los endpoints públicos requieren `queueSessionToken`, la exposición real es baja.

### M7. `sanitizeString` elimina sólo `<…>` simples
`src/lib/request-validator.ts:30-36`. No neutraliza entidades HTML ni datos SQL-like. Como los datos se envían upstream (Centinela con SQLAlchemy, se asume), la responsabilidad final es del upstream, pero convendría convertir a sanitización strict (whitelist) para campos PII (`cedula`, `telefono`).

### M8. Enumeración solo por `condominioId`
`src/lib/anti-enumeration.ts`. Solo se evalúa el `condominioId`, no combinaciones `(condominioId, empresaId)` ni `ticketUuid`. Un atacante puede probar muchos `userIdEmpresa` desde una misma sesión sin ser penalizado.

### M9. SSE sin timeout superior y canal derivado de parámetro de query
`src/app/api/queue/stream/route.ts:64`. El canal Redis `tickets_${userRolIdEmpresa}` se construye con input validado (entero positivo), aceptable; pero la conexión SSE no tiene deadline máximo ni métricas de conexiones concurrentes por IP → posible agotamiento de FDs/subscribers con conexiones masivas.

## 4. Hallazgos bajos

### L1. `createClientUuid` fallback con `Math.random()` para UUID
`src/lib/atc-device-id.ts:6-13`. Si `crypto.randomUUID` no existe, usa `Math.random` → no criptográficamente fuerte. Aceptable para fingerprint, pero conviene documentar.

### L2. Logs incluyen IP prefix y UA preview
`src/app/api/queue/status/[uuid]/route.ts:37`, `src/app/api/queue/unidades/route.ts:34`. PII menor (IP). Considerar hashing antes de log o truncamiento.

### L3. `metadataBase` usa `http://localhost:3000` en fallback
`src/app/layout.tsx:15-17`. Si `NEXT_PUBLIC_APP_URL` no está definido, OpenGraph genera URLs localhost.

### L4. `ecosystem.config.cjs` no fuerza `NODE_ENV=production` en `env`
El default `env` sí lo declara, pero si alguien arranca con `pm2 start` sin `--env production`, se usa el bloque `env`, que aquí sí tiene `NODE_ENV=production`. OK; pero conviene un checker en startup.

### L5. `Inter` font cargada desde Google Fonts en `next/font/google`
Aunque Next la self-hostea, el build-time fetch requiere conectividad → CI y aislamiento de red pueden fallar silenciosamente. Marginal.

### L6. `qrcode.toDataURL` incrusta una data URL en el JSON de respuesta
No es una vulnerabilidad, pero si el `condominioId` o labels fueran inyectados podrían afectar la calidad del QR. El schema Zod ya valida.

### L7. `proxy.ts` (middleware) no limita tamaño de cuerpo
Next aplica límites por defecto, pero convendría validar `content-length` para endpoints JSON (max 256 KiB) para reducir DoS de parseo.

## 5. Auditoría de dependencias (`npm audit`)

`npm audit` declara **8 vulnerabilidades low**, todas cadenas transitivas de `firebase-admin 12.7.0`:

- `@tootallnate/once <3.0.1` → GHSA-vpq2-c234-7xj6 (CWE-705, CVSS 3.3).
- `http-proxy-agent 4.0.1 - 5.0.0`, `teeny-request 7.1.3 - 10.1.0`, `retry-request 7.0.0 - 7.0.2`, `google-gax 4.0.5-exp - 4.6.1`, `@google-cloud/storage ≥5.19.0`, `@google-cloud/firestore 7.6.0 - 7.11.6`.

El reporte sugiere `firebase-admin 10.3.0` como "fix" (downgrade) — **falso positivo**: la solución real es actualizar a la última minor de `firebase-admin` (≥ 13.x) cuando esté disponible, o aceptar el riesgo (explotación requiere condiciones muy específicas en procesos Node locales).

## 6. Análisis final basado en versiones declaradas en `package.json`

Revisado contra CVE/advisories públicos (abril 2026):

### `next: 16.2.3`
- Versión estable reciente. **No tiene CVEs públicos abiertos en el canal 16.x**.
- Vulnerabilidades previas corregidas antes de esta versión:
  - CVE-2025-29927 (middleware bypass vía `x-middleware-subrequest`) — fixed en 14.2.25 / 15.2.3. El middleware `proxy.ts` usa la nueva API de proxy, por lo que ya no aplica.
  - CVE-2025-55173 (Dev-server CSRF) — fixed en 15.4.5.
  - CVE-2025-57752 (cache poisoning SSR) — fixed en 15.4.5.
- **Recomendación**: mantener `next` en 16.x, suscribirse al canal de seguridad de Vercel.

### `react: 19.2.4`, `react-dom: 19.2.4`
- Ambos instalados 19.2.4 (verificado con `npm ls`). React 19.2 es versión vigente.
- `babel-plugin-react-compiler@1.0.0` declara peer `0.0.0-experimental-…` — inconsistencia marcada por npm como `deduped invalid` pero funcional.
- **Ningún CVE conocido** en react 19.2.x.

### `firebase: ^12.12.0` (SDK cliente)
- Instalado 12.12.0. Al 2026-04, versión actual. Sin CVEs propias.
- El SDK se sirve en `/sw.js` como `importScripts('https://www.gstatic.com/firebasejs/12.12.0/...')`; la versión en el service worker está hardcoded y debe sincronizarse manualmente → riesgo operativo futuro, no vuln directa.

### `firebase-admin: 12.7.0`
- Pinneado sin `^`. Al 2026-04 la serie 12.x está en mantenimiento; ya hay 13.x.
- **8 advisories transitivas low** (ver sección 5). Ninguna explota a través de `sendEachForMulticast` en el modo actual.
- **Recomendación**: `npm i firebase-admin@latest` para cerrar las 8 advisories y alinear con `google-gax 5.x`.

### `ioredis: ^5.10.1`
- Serie 5.x es actual; **sin CVEs abiertas**. Nota: advisory histórico **CVE-2024-27297** afectó a versiones 5.3.x anteriores por el comando `CLIENT` y ya está cerrado.
- **Recomendación**: ninguna urgente.

### `framer-motion: ^12.38.0`
- Serie 12.x actual; sin CVEs abiertas.

### `zod: ^4.3.6`
- Zod 4 es la versión vigente (Zod 4 GA 2025). Sin CVEs. La inconsistencia `invalid: "3.25.76" from next` es ruido (Next publica un peer laxo).
- **Observación de seguridad**: el helper `validateRequestBody` usa `schema.parse` (lanza `ZodError`). El código de `login/route.ts` llama `safeParse` directamente pero sin usar `validateRequestBody`. Uniformar reduce riesgo de no validar.

### `qrcode: ^1.5.4`
- Última 1.5.x. Sin CVEs abiertas.
- **Observación**: se invoca `QRCode.toDataURL(url, { width: 320, margin: 2 })` con `url` controlado por el servidor (tras `encodeURIComponent(token)`), por lo que no hay superficie adicional.

### `lucide-react: ^1.8.0`
- Verificado: **`latest` es 1.8.0** (no es una versión antigua pese a su numeración). Sin CVEs.

### `@tailwindcss/postcss: ^4`, `tailwindcss: ^4`
- Tailwind 4 actual; sin CVEs relevantes al build.

### `eslint: ^9`, `eslint-config-next: 16.2.3`, `typescript: ^5`
- Solo dev; **sin CVEs abiertas** en 9.x/5.x.

### `babel-plugin-react-compiler: 1.0.0`
- Release GA de React Compiler. Sin CVEs conocidas. Peer `react@0.0.0-experimental-…` genera ruido en `npm ls`.

### `@types/*`
- Solo tipos; no ejecutan código.

### Vulnerabilidades nuevas o reconfirmadas tras este segundo pase

1. **Reconfirmada** C2 (`SESSION_SECRET` fallback) — no es un CVE de dependencia pero sí un vector crítico de la implementación.
2. **Nueva** (descubierta en el segundo pase): **M5 race condition en `idempotencyStore`** + ausencia de lock distribuido → doble-ticket en Centinela bajo concurrencia. Esto no estaba en la lista inicial y constituye hallazgo M nuevo.
3. **Nueva**: `sw.js` hardcodea la versión `FIREBASE_JS_COMPAT_VERSION = "12.12.0"` mientras `package.json` declara `^12.12.0`. Un upgrade minor de `firebase` dejará el SW usando compat 12.12.0 mientras el resto usa >12.12 → desincronización silenciosa (drift). No es CVE pero es defecto de seguridad operacional (L nueva).
4. **Nueva**: `push/fcm/unregister` acepta `fcmToken` opcional; si se omite, borra **todos** los tokens del `installId` registrados para ese ticket. Combinado con sesión válida + empresa correcta, es comportamiento esperado. Pero un atacante con acceso a una `queueSessionToken` activa (p. ej. mismo wifi, hash IP/UA coincidente) puede des-registrar las notificaciones de otros dispositivos que compartan `installId` (p. ej. tras robo de `localStorage`). Riesgo medio-bajo.

## 7. Plan de remediación priorizado

1. **Inmediato (bloqueadores)**:
   - C1: reemplazar HMAC por argon2id con salt por cuenta.
   - C2: fail-fast en arranque si falta `SESSION_SECRET`/`QR_TOKEN_SECRET`/`API_INTERNAL_KEY`.
   - C3: mover token admin a cookie `HttpOnly; Secure; SameSite=Lax` y rotación corta.
   - H1: eliminar `'unsafe-inline'`; inyectar nonce CSP por request.
2. **Alta (próxima iteración)**:
   - H2 + M5: migrar idempotencia/rate-limit/anti-enumeración a Redis.
   - H3: fallar explícito si Redis cae en endpoints críticos.
   - H4: reducir `QR_TTL_MS` ≤ 90 días; forzar rotación `kid`.
   - H5: eliminar bypass `dev-bypass`.
   - H6: documentar trusted proxy; usar `x-real-ip`/`cf-connecting-ip`.
   - H7: allowlist IP + rate-limit específico en `/api/internal/*`.
3. **Media/Baja**:
   - M1–M4, M6–M9: ajuste de headers y validaciones de contenido.
   - L1–L7: limpiezas operativas.
4. **Dependencias**:
   - `npm i firebase-admin@latest` para cerrar los 8 avisos low.
   - Desacoplar `FIREBASE_JS_COMPAT_VERSION` del SW usando variable coherente con la versión del paquete en runtime.

## 8. Validaciones y comandos útiles

```bash path=null start=null
# Auditoría npm
cd guachi-atc-web && npm audit

# Verificar secrets en arranque (propuesta)
node -e "for (const k of ['SESSION_SECRET','QR_TOKEN_SECRET','API_INTERNAL_KEY','ADMIN_PASSWORD_HASH']) { if(!process.env[k]){console.error('Missing', k);process.exit(1);}}"

# Probar CSP actual
curl -sSI https://<host>/ | grep -i content-security-policy

# Probar tope de login
for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<host>/api/admin/auth/login -H 'Content-Type: application/json' -d '{"password":"x"}'; done
```

---

Documento generado como parte de la auditoría interna del proyecto `guachi-atc-web`. Para cualquier hallazgo explotable en producción, abrir issue privado y contactar a seguridad antes de publicar PoC.
