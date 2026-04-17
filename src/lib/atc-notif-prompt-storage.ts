/**
 * Persistencia del aviso de permisos de notificación (localStorage).
 * Evita mostrar el mismo modal en cada nuevo ticket si el usuario ya otorgó permiso o pospuso el aviso.
 */

const STORAGE_KEY = "guachi_atc_notif_prompt_v1";

type StoredV1 = {
  v: 1;
  /** Usuario completó activación (Notification.permission quedó granted en algún momento). */
  grantedRecordedAt?: number;
  /** "Ahora no" o cierre sin conceder. */
  dismissedAt?: number;
  /** No volver a mostrar hasta esta fecha (ms). */
  snoozeUntil?: number;
};

function read(): StoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as StoredV1;
    return p?.v === 1 ? p : null;
  } catch {
    return null;
  }
}

function write(data: StoredV1): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota */
  }
}

/** ¿Mostrar el modal de permisos? Solo si el navegador aún no decidió (default). */
export function shouldShowNotificationPromptModal(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "default") return false;

  const s = read();
  if (!s) return true;
  if (s.grantedRecordedAt) return false;
  if (s.snoozeUntil != null && Date.now() < s.snoozeUntil) return false;
  return true;
}

/** Tras conceder permisos (o si ya constaba en sesiones anteriores y guardamos granted). */
export function recordNotifPromptGranted(): void {
  write({
    v: 1,
    grantedRecordedAt: Date.now(),
    snoozeUntil: undefined,
    dismissedAt: undefined,
  });
}

/**
 * Usuario pospuso el aviso o cerró sin activar.
 * @param snoozeDays días hasta la próxima vez que se puede mostrar (por defecto 14).
 */
export function recordNotifPromptSnoozed(snoozeDays = 14): void {
  const ms = snoozeDays * 24 * 60 * 60 * 1000;
  const prev = read();
  write({
    v: 1,
    grantedRecordedAt: prev?.grantedRecordedAt,
    dismissedAt: Date.now(),
    snoozeUntil: Date.now() + ms,
  });
}
