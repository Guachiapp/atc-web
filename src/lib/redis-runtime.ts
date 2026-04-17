import Redis from "ioredis";

type MemoryEntry = { value: string; expiresAt: number | null };
const memoryStore = new Map<string, MemoryEntry>();

let redisClient: Redis | null = null;

/**
 * Conexión dedicada para pub/sub (ioredis exige `duplicate()`; no usar el cliente principal en modo subscribe).
 */
export function createQueueTicketSubscriber(): Redis | null {
  const base = getRedisClient();
  if (!base) return null;
  try {
    return base.duplicate({
      lazyConnect: true,
      maxRetriesPerRequest: null,
      // Sin cola offline, `subscribe` puede lanzar "Stream isn't writeable" antes de que el socket esté listo.
      enableOfflineQueue: true,
    });
  } catch (error) {
    console.error("[redis-runtime] duplicate subscriber failed", error);
    return null;
  }
}

/** Indica si hay `REDIS_URL` (persistencia real; sin esto el runtime usa memoria en proceso). */
export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
    enableOfflineQueue: true,
  });
  return redisClient;
}

function isExpired(entry: MemoryEntry): boolean {
  return entry.expiresAt !== null && entry.expiresAt <= Date.now();
}

function cleanupMemoryKey(key: string): void {
  const entry = memoryStore.get(key);
  if (!entry) return;
  if (isExpired(entry)) memoryStore.delete(key);
}

async function withRedis<T>(action: (redis: Redis) => Promise<T>, fallback: () => T): Promise<T> {
  const redis = getRedisClient();
  if (!redis) return fallback();
  try {
    if (redis.status === "wait") await redis.connect();
    return await action(redis);
  } catch (error) {
    console.error("[redis-runtime] Redis operation failed, using memory fallback", error);
    return fallback();
  }
}

export async function rtSetEx(key: string, seconds: number, value: string): Promise<void> {
  await withRedis(
    async (redis) => {
      await redis.setex(key, seconds, value);
    },
    () => {
      memoryStore.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    },
  );
}

/**
 * SET key value EX seconds NX — devuelve true solo si la clave no existía (primera emisión).
 * Útil para deduplicar eventos entre varias réplicas del servidor.
 */
export async function rtSetNxEx(key: string, seconds: number, value: string = "1"): Promise<boolean> {
  return withRedis(
    async (redis) => {
      const r = await redis.set(key, value, "EX", seconds, "NX");
      return r === "OK";
    },
    () => {
      cleanupMemoryKey(key);
      const existing = memoryStore.get(key);
      if (existing && !isExpired(existing)) return false;
      memoryStore.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
      return true;
    },
  );
}

export async function rtSet(key: string, value: string): Promise<void> {
  await withRedis(
    async (redis) => {
      await redis.set(key, value);
    },
    () => {
      memoryStore.set(key, { value, expiresAt: null });
    },
  );
}

export async function rtGet(key: string): Promise<string | null> {
  return withRedis(
    async (redis) => redis.get(key),
    () => {
      cleanupMemoryKey(key);
      return memoryStore.get(key)?.value ?? null;
    },
  );
}

export async function rtExists(key: string): Promise<boolean> {
  return withRedis(
    async (redis) => (await redis.exists(key)) === 1,
    () => {
      cleanupMemoryKey(key);
      return memoryStore.has(key);
    },
  );
}

export async function rtDel(key: string): Promise<void> {
  await withRedis(
    async (redis) => {
      await redis.del(key);
    },
    () => {
      memoryStore.delete(key);
    },
  );
}

export async function rtIncrWithExpiry(key: string, windowSeconds: number): Promise<number> {
  return withRedis(
    async (redis) => {
      const value = await redis.incr(key);
      if (value === 1) await redis.expire(key, windowSeconds);
      return value;
    },
    () => {
      cleanupMemoryKey(key);
      const current = Number(memoryStore.get(key)?.value ?? "0") + 1;
      memoryStore.set(key, { value: String(current), expiresAt: Date.now() + windowSeconds * 1000 });
      return current;
    },
  );
}

type MemorySetEntry = { members: Set<string>; expiresAt: number | null };
const memorySets = new Map<string, MemorySetEntry>();

function cleanupMemorySet(key: string): void {
  const e = memorySets.get(key);
  if (!e) return;
  if (e.expiresAt !== null && e.expiresAt <= Date.now()) memorySets.delete(key);
}

/** Añade un miembro a un set Redis (o memoria en fallback). */
export async function rtSAdd(key: string, member: string): Promise<number> {
  return withRedis(
    async (redis) => {
      return await redis.sadd(key, member);
    },
    () => {
      cleanupMemorySet(key);
      let e = memorySets.get(key);
      if (!e) {
        e = { members: new Set(), expiresAt: null };
        memorySets.set(key, e);
      }
      if (e.members.has(member)) return 0;
      e.members.add(member);
      return 1;
    },
  );
}

export async function rtSRem(key: string, member: string): Promise<number> {
  return withRedis(
    async (redis) => {
      return await redis.srem(key, member);
    },
    () => {
      cleanupMemorySet(key);
      const e = memorySets.get(key);
      if (!e) return 0;
      return e.members.delete(member) ? 1 : 0;
    },
  );
}

export async function rtSMembers(key: string): Promise<string[]> {
  return withRedis(
    async (redis) => {
      return await redis.smembers(key);
    },
    () => {
      cleanupMemorySet(key);
      const e = memorySets.get(key);
      return e ? [...e.members] : [];
    },
  );
}

/** SCAN MATCH (solo Redis real; en fallback memoria devuelve []). */
export async function rtScanKeys(match: string): Promise<string[]> {
  return withRedis(
    async (redis) => {
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [next, batch] = await redis.scan(cursor, "MATCH", match, "COUNT", 200);
        cursor = next;
        keys.push(...batch);
      } while (cursor !== "0");
      return keys;
    },
    () => [],
  );
}

/** Expira una clave string o set (TTL en segundos). */
export async function rtExpire(key: string, seconds: number): Promise<void> {
  await withRedis(
    async (redis) => {
      await redis.expire(key, seconds);
    },
    () => {
      const e = memorySets.get(key);
      if (e) e.expiresAt = Date.now() + seconds * 1000;
      const str = memoryStore.get(key);
      if (str) {
        memoryStore.set(key, { ...str, expiresAt: Date.now() + seconds * 1000 });
      }
    },
  );
}
