// Lightweight in-memory TTL cache for report/list GET endpoints.
// Only meaningful on the single Render instance; a short TTL keeps results
// fresh while making repeat loads (tab switches, refreshes, searches) fast.

const store = new Map();
const DEFAULT_TTL = 12_000; // ms

function keyOf(tenantId, key) {
  return `${tenantId || "default"}:${key}`;
}

export function cacheGet(tenantId, key) {
  const entry = store.get(keyOf(tenantId, key));
  if (!entry) return undefined;
  if (Date.now() - entry.at < entry.ttl) return entry.value;
  store.delete(keyOf(tenantId, key));
  return undefined;
}

export function cacheSet(tenantId, key, value, ttl = DEFAULT_TTL) {
  store.set(keyOf(tenantId, key), { value, at: Date.now(), ttl });
  if (store.size > 600) {
    const now = Date.now();
    for (const [k, v] of store) {
      if (now - v.at >= v.ttl) store.delete(k);
    }
  }
  return value;
}

export function invalidateCache(tenantId) {
  const prefix = `${tenantId || "default"}:`;
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
  return true;
}