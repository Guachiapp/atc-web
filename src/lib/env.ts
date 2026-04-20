/**
 * Validación de variables de entorno críticas en arranque del servidor.
 * Lanzar un error explícito (fail-fast) impide que la app arranque con secretos
 * por defecto ("CHANGE_THIS_IN_PRODUCTION") o sin claves requeridas.
 *
 * Llamar a `validateEnv()` desde `src/instrumentation.ts` en el hook `register`.
 */

const REQUIRED_IN_PRODUCTION: ReadonlyArray<string> = [
  "SESSION_SECRET",
  "QR_TOKEN_SECRET",
  "API_INTERNAL_KEY",
  "ADMIN_PASSWORD_HASH",
];

/** Longitud mínima aceptable para considerar un secreto no trivial. */
const MIN_SECRET_LENGTH = 32;

/** Valores conocidos como inseguros que deben rechazarse siempre. */
const FORBIDDEN_VALUES: ReadonlySet<string> = new Set([
  "CHANGE_THIS_IN_PRODUCTION",
  "change_this_in_production",
  "secret",
  "password",
  "1234",
  "admin",
]);

export function validateEnv(): void {
  const isProd = process.env.NODE_ENV === "production";
  const errors: string[] = [];

  for (const key of REQUIRED_IN_PRODUCTION) {
    const value = process.env[key];

    if (!value || value.trim() === "") {
      if (isProd) {
        errors.push(`[env] Variable de entorno requerida no definida: ${key}`);
      } else {
        console.warn(`[env] ⚠️  Variable de entorno no definida en desarrollo: ${key}`);
      }
      continue;
    }

    if (FORBIDDEN_VALUES.has(value)) {
      errors.push(`[env] Variable ${key} contiene un valor inseguro conocido. Usa un secreto criptográfico aleatorio.`);
      continue;
    }

    // ADMIN_PASSWORD_HASH puede ser un hash argon2 largo — no aplica límite de longitud mínima.
    if (key !== "ADMIN_PASSWORD_HASH" && value.length < MIN_SECRET_LENGTH) {
      errors.push(`[env] Variable ${key} es demasiado corta (mínimo ${MIN_SECRET_LENGTH} caracteres). Usa un secreto seguro.`);
    }
  }

  if (errors.length > 0) {
    const message = [
      "",
      "══════════════════════════════════════════════════",
      "  ERROR DE CONFIGURACIÓN DE SEGURIDAD — STARTUP",
      "══════════════════════════════════════════════════",
      ...errors.map((e) => `  • ${e}`),
      "",
      "  Genera secretos seguros con:",
      "  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
      "══════════════════════════════════════════════════",
      "",
    ].join("\n");

    console.error(message);
    process.exit(1);
  }
}
