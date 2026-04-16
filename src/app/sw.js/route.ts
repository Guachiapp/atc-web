import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Misma familia de versión que `firebase` en package.json (evita fallos al suscribirse al push). */
const FIREBASE_JS_COMPAT_VERSION = "12.12.0";

/**
 * Service worker para FCM (fondo). Debe servirse en la raíz del sitio (`/sw.js`) con scope `/`.
 */
export async function GET() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "";
  if (!apiKey || !projectId || !appId) {
    return new Response("// Firebase web: define NEXT_PUBLIC_FIREBASE_* en .env", {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const config = {
    apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId,
  };

  const v = FIREBASE_JS_COMPAT_VERSION;
  const script = `
importScripts('https://www.gstatic.com/firebasejs/${v}/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/${v}/firebase-messaging-compat.js');
firebase.initializeApp(${JSON.stringify(config)});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification && payload.notification.title ? payload.notification.title : 'Guachi';
  const body = payload.notification && payload.notification.body ? payload.notification.body : '';
  const options = {
    body: body,
    icon: (payload.notification && payload.notification.icon) || '/images/guachi_logo_azul_horizontal.png',
    tag: 'guachi-atc-queue',
    data: payload.data || {},
  };
  return self.registration.showNotification(title, options);
});
`;

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
