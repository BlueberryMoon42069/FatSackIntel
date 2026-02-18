interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cacheStore = new Map<string, CacheEntry<unknown>>();

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  cacheStore.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function getCache<T>(key: string): T | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  return entry.data as T;
}

export function invalidateCache(keyPrefix: string): void {
  for (const key of Array.from(cacheStore.keys())) {
    if (key.startsWith(keyPrefix)) {
      cacheStore.delete(key);
    }
  }
}

// TTL constants (milliseconds)
export const TTL = {
  RANKINGS: 5 * 60 * 1000,      // 5 minutes
  HISTORICAL_STATS: 60 * 60 * 1000, // 1 hour
  TOWN_SUMMARY: 10 * 60 * 1000, // 10 minutes
  SOCIAL: 2 * 60 * 1000,        // 2 minutes
  RELIABILITY: 60 * 60 * 1000,  // 1 hour
  HEALTH: 30 * 1000,            // 30 seconds
};
