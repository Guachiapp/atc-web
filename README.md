# Guachi ATC Web

Módulo web de ATC/gestión de colas para empresas; parte del producto Guachi.

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

## Requisitos de Infraestructura (Proxy / IP Real)

Para garantizar la seguridad de los rate-limiters y el sistema anti-enumeración, **esta aplicación debe desplegarse detrás de un proxy inverso confiable** (ej. Nginx, Cloudflare o AWS ALB) que sobrescriba y limpie cabeceras que pueden ser falsificadas (`X-Forwarded-For`).
1. Si usas Cloudflare, la IP se tomará de `cf-connecting-ip`.
2. Si usas Nginx o similar, asegúrate de que inyecte `X-Real-IP`. Por ejemplo: `proxy_set_header X-Real-IP $remote_addr;`.

## Generar `ADMIN_PASSWORD_HASH`

El hash utiliza **argon2id** para prevenir ataques de fuerza bruta. Para generar tu hash:

```bash
node -e "require('argon2').hash('TU_PASSWORD_ADMIN', { type: require('argon2').argon2id }).then(console.log)"
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
  - validación contra Turnstile (`TURNSTILE_SECRET_KEY`).
