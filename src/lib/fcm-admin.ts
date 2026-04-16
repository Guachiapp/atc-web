import type { App } from "firebase-admin/app";
import * as admin from "firebase-admin";

let app: App | null = null;

function getFirebaseAdminApp(): App | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  if (app) return app;
  try {
    const cred = JSON.parse(raw) as admin.ServiceAccount;
    if (!admin.apps.length) {
      app = admin.initializeApp({
        credential: admin.credential.cert(cred),
      });
    } else {
      app = admin.app();
    }
    return app;
  } catch (e) {
    console.error("[fcm-admin] FIREBASE_SERVICE_ACCOUNT_JSON inválido", e);
    return null;
  }
}

export function isFcmConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
}

export async function sendFcmToTokens(
  tokens: string[],
  notification: { title: string; body: string },
  data: Record<string, string> = {},
): Promise<{ success: number; failure: number }> {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp || tokens.length === 0) {
    return { success: 0, failure: tokens.length > 0 ? tokens.length : 0 };
  }

  const messaging = admin.messaging();
  const unique = [...new Set(tokens)];
  let success = 0;
  let failure = 0;
  const chunkSize = 500;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const res = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data,
      webpush: {
        fcmOptions: {
          link: "/",
        },
        notification: {
          icon: "/images/guachi_logo_azul_horizontal.png",
        },
      },
    });
    success += res.successCount;
    failure += res.failureCount;
  }

  return { success, failure };
}

export function resetFcmAdminForTests(): void {
  app = null;
}
