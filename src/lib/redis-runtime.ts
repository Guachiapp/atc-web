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
      enableOfflineQueue: false,
    });
  } catch (error) {
    console.error("[redis-runtime] duplicate subscriber failed", error);
    return null;
  }
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
