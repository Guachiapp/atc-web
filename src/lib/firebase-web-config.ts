/**
 * Configuración pública de Firebase para Web (solo variables NEXT_PUBLIC_*).
 * La clave VAPID (pair) se genera en Firebase Console → Cloud Messaging → Web Push certificates.
 */
export const firebaseWebPublicConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
} as const;

export function isFirebaseWebConfigComplete(): boolean {
  return Boolean(
    firebaseWebPublicConfig.apiKey &&
      firebaseWebPublicConfig.projectId &&
      firebaseWebPublicConfig.appId &&
      firebaseWebPublicConfig.messagingSenderId,
  );
}

export function getFirebaseVapidKey(): string {
  return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() ?? "";
}

/** La clave pública VAPID de Firebase suele ser ~87 caracteres base64url (sin espacios ni comillas). */
export function isLikelyValidVapidPublicKey(key: string): boolean {
  if (key.length < 80) return false;
  return /^[A-Za-z0-9_-]+$/.test(key);
}

/** Listo para Web Push FCM: proyecto web + clave VAPID (pair) en consola Firebase. */
export function isFcmWebPushConfigured(): boolean {
  return isFirebaseWebConfigComplete() && getFirebaseVapidKey().length > 0;
}
