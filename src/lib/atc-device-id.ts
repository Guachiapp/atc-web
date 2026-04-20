"use client";

/** Misma clave que usa la cola / huella de dispositivo (persistente en el navegador). */
export const ATC_DEVICE_INSTALL_STORAGE_KEY = "atc.queue.device.install-id";

export function createClientUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  
  // Fallback seguro usando getRandomValues (L1)
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    return template.replace(/[xy]/g, (c) => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Fallback extremo (poco probable en navegadores modernos)
  return template.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getOrCreateDeviceInstallId(): string {
  if (typeof window === "undefined") return "";
  const current = window.localStorage.getItem(ATC_DEVICE_INSTALL_STORAGE_KEY);
  if (current && current.trim().length > 8) return current;
  const created = createClientUuid();
  window.localStorage.setItem(ATC_DEVICE_INSTALL_STORAGE_KEY, created);
  return created;
}
