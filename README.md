# Guachi ATC Web

Módulo web de ATC/gestión de colas para empresas integrado al ecosistema Guachi.

## Funcionalidades MVP implementadas

- Ingreso público por QR firmado: `GET /q/[token]`.
- Flujo visitante:
  - validar QR,
  - crear sesión efímera de cola,
  - listar empresas por condominio,
  - generar ticket,
  - enviar datos opcionales del cliente.
- Panel admin:
  - login básico,
  - generar QR firmado por condominio/empresa,
  - revocar token QR.
- Seguridad base:
  - HMAC para QR y sesión efímera,
  - route handlers server-side con `X-Internal-Key`,
  - rate limiting,
  - anti-enumeración por IP/ID.

## Variables de entorno

Usa `.env.example` como base.

```bash
cp .env.example .env.local
```

Debes definir:
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `API_INTERNAL_KEY`
- `QR_TOKEN_SECRET`
- `SESSION_SECRET`
- `ADMIN_PASSWORD_HASH`
- `REDIS_URL`
- `TURNSTILE_SECRET_KEY` (CAPTCHA adaptativo)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (si se integra widget en UI)

## Generar `ADMIN_PASSWORD_HASH`

El hash sigue la lógica HMAC-SHA256 con `SESSION_SECRET`.

```bash
node -e "const { createHmac } = require('crypto'); const secret='TU_SESSION_SECRET'; const pass='TU_PASSWORD_ADMIN'; console.log(createHmac('sha256', secret).update(pass).digest('hex'));"
```

## Desarrollo

Gestión de dependencias con **npm** (`package-lock.json`). Evita mezclar con pnpm u otros gestores para no duplicar locks.

```bash
npm install
npm run dev
```

Portal público:
- `http://localhost:3000`

Portal admin:
- `http://localhost:3000/admin/login`

## Build

```bash
npm run build
npm run start
```

## Hardening implementado

- **Persistencia de seguridad en Redis**:
  - sesiones admin validadas contra store con TTL,
  - sesiones efímeras de cola vinculadas a IP + user-agent hash,
  - revocación de QR persistida por `jti` hasta expiración.
- **CAPTCHA adaptativo**:
  - score por riesgo/velocidad por IP y acción,
  - exige token CAPTCHA solo cuando el score supera umbral,
  - validación contra Turnstile (`TURNSTILE_SECRET_KEY`),
  - en desarrollo permite token `dev-bypass` si no hay secret configurado.
