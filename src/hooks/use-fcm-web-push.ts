"use client";

import { useCallback, useState } from "react";
import { getApps, getApp, initializeApp } from "firebase/app";
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import {
  firebaseWebPublicConfig,
  getFirebaseVapidKey,
  isFcmWebPushConfigured,
  isLikelyValidVapidPublicKey,
} from "@/lib/firebase-web-config";

export type FcmWebPushState = "idle" | "unsupported" | "registering" | "registered" | "error";

/** Comprueba que /sw.js no sea el stub sin Firebase (p. ej. faltan NEXT_PUBLIC_* en el build). */
async function assertFirebaseServiceWorkerHasConfig(): Promise<void> {
  const res = await fetch("/sw.js", { cache: "no-store" });
  const text = await res.text();
  if (!text.includes("firebase.initializeApp")) {
    throw new Error(
      "El service worker no incluye Firebase. Define NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_PROJECT_ID y NEXT_PUBLIC_FIREBASE_APP_ID, reinicia el servidor y recarga la página.",
    );
  }
}

function describeFcmRegistrationError(e: unknown): string {
  if (!(e instanceof Error)) return "Error al registrar push";
  const m = e.message;
  const low = m.toLowerCase();
  if (
    e.name === "AbortError" ||
    low.includes("registration failed") ||
    low.includes("push service")
  ) {
    return (
      "No se pudo suscribir al servicio push. Revisa: (1) la clave VAPID en Firebase Console → Cloud Messaging → Web Push certificates debe ser del mismo proyecto que el resto de variables NEXT_PUBLIC_FIREBASE_*; " +
      "(2) usa HTTPS o localhost; (3) prueba sin bloqueadores o en ventana de incógnito; " +
      "(4) tras cambiar .env, recarga forzada (p. ej. Ctrl+Shift+R) para actualizar el service worker."
    );
  }
  return m;
}

export function useFcmWebPush(params: {
  queueSessionToken: string;
  userIdEmpresa: number;
  userRolIdEmpresa: number;
  ticketUuid: string;
  installId: string | undefined;
}) {
  const [state, setState] = useState<FcmWebPushState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const register = useCallback(async () => {
    setError(null);
    const installId = params.installId?.trim();
    if (!installId || installId.length < 8) {
      setState("error");
      setError("Falta identificador de dispositivo");
      return;
    }
    if (!isFcmWebPushConfigured()) {
      setState("unsupported");
      return;
    }
    const supported = await isSupported().catch(() => false);
    if (!supported) {
      setState("unsupported");
      return;
    }
    if (typeof Notification === "undefined" || typeof navigator === "undefined" || !navigator.serviceWorker) {
      setState("unsupported");
      return;
    }

    let perm = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
    }
    if (perm !== "granted") {
      setState("error");
      setError("Permiso de notificaciones denegado");
      return;
    }

    setState("registering");
    try {
      await assertFirebaseServiceWorkerHasConfig();

      const vapid = getFirebaseVapidKey();
      if (!isLikelyValidVapidPublicKey(vapid)) {
        throw new Error(
          "NEXT_PUBLIC_FIREBASE_VAPID_KEY no parece válida (copia la clave pública completa de Firebase Console, sin comillas ni espacios).",
        );
      }

      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await reg.update();
      await navigator.serviceWorker.ready;

      const app = getApps().length ? getApp() : initializeApp(firebaseWebPublicConfig);
      const messaging = getMessaging(app);
      const tokenOpts = { vapidKey: vapid, serviceWorkerRegistration: reg };

      let fcmToken: string;
      try {
        fcmToken = (await getToken(messaging, tokenOpts)) ?? "";
      } catch (firstErr) {
        await deleteToken(messaging).catch(() => {});
        fcmToken = (await getToken(messaging, tokenOpts)) ?? "";
        if (!fcmToken) throw firstErr;
      }
      if (!fcmToken) {
        throw new Error("No se obtuvo token FCM");
      }

      const res = await fetch("/api/push/fcm/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueSessionToken: params.queueSessionToken,
          userIdEmpresa: params.userIdEmpresa,
          userRolIdEmpresa: params.userRolIdEmpresa,
          ticketUuid: params.ticketUuid,
          installId,
          fcmToken,
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Registro rechazado");
      }
      setToken(fcmToken);
      setState("registered");
    } catch (e) {
      console.warn("[useFcmWebPush] register", e);
      setState("error");
      setError(describeFcmRegistrationError(e));
    }
  }, [
    params.installId,
    params.queueSessionToken,
    params.userIdEmpresa,
    params.userRolIdEmpresa,
    params.ticketUuid,
  ]);

  const unregister = useCallback(async () => {
    const installId = params.installId?.trim();
    if (!installId || installId.length < 8) return;
    const t = token;
    if (!t) return;
    try {
      await fetch("/api/push/fcm/unregister", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueSessionToken: params.queueSessionToken,
          userIdEmpresa: params.userIdEmpresa,
          ticketUuid: params.ticketUuid,
          installId,
          fcmToken: t,
        }),
      });
    } catch {
      /* noop */
    }
    setToken(null);
    setState("idle");
  }, [params.installId, params.queueSessionToken, params.userIdEmpresa, params.ticketUuid, token]);

  return { state, error, token, register, unregister };
}
