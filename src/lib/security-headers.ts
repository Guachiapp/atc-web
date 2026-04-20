/**
 * Cabeceras de seguridad HTTP para guachi-atc-web.
 *
 * Las cabeceras se aplican a todas las respuestas desde `proxy.ts` (middleware Next.js).
 * El nonce se genera por request en el middleware y se pasa aquí para incluirlo en la CSP.
 *
 * Referencias:
 * - https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
 * - node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
 */

/**
 * Dominios externos que la app necesita contactar.
 * Mantener esta lista tan restrictiva como sea posible.
 */
const ALLOWED_CONNECT_DOMAINS = [
  "https://*.guachiapp.com",
  "https://fcm.googleapis.com",
  "https://firebaseinstallations.googleapis.com",
  "https://firebase.googleapis.com",
  "https://challenges.cloudflare.com",
].join(" ");

const ALLOWED_SCRIPT_DOMAINS = [
  // Firebase JS SDK cargado desde gstatic en el service worker
  "https://www.gstatic.com",
  // Turnstile CAPTCHA de Cloudflare
  "https://challenges.cloudflare.com",
].join(" ");

export function getSecurityHeaders(nonce: string): Record<string, string> {
  const isDev = process.env.NODE_ENV === "development";

  /**
   * CSP por entorno:
   * - Desarrollo: se permiten 'unsafe-eval' (React DevTools) y 'unsafe-inline' para estilos.
   * - Producción: nonce estricto por request, sin 'unsafe-inline' ni 'unsafe-eval'.
   */
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' ${ALLOWED_SCRIPT_DOMAINS}`
    : `'self' 'nonce-${nonce}' 'strict-dynamic' ${ALLOWED_SCRIPT_DOMAINS}`;

  const styleSrc = isDev
    ? `'self' 'unsafe-inline'`
    : `'self' 'nonce-${nonce}'`;

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: https:",
    `connect-src 'self' ${ALLOWED_CONNECT_DOMAINS}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // X-XSS-Protection: 0  — el header legacy 1;mode=block puede causar XS-Leaks en
    // navegadores antiguos. Los navegadores modernos ignoran este header; la defensa
    // contra XSS la provee la CSP anterior.
    "X-XSS-Protection": "0",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": csp,
  };

  // HSTS: aplicar siempre salvo que se desactive explícitamente (p. ej. en dev con DISABLE_HSTS=1).
  if (process.env.DISABLE_HSTS !== "1") {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";
  }

  return headers;
}
