// Serves cached GET responses BEFORE any DB work (update index.html copy too).
// Runs as the FIRST onRequest hook so on cache hits we never open a Supabase
// connection nor resolve the tenant from the DB. Tenant namespace comes from
// the JWT payload (tenant_id), so no DB is needed for a correct cache key.
// On a miss the request proceeds to tenantResolver/withDb/permission checks and
// the route handler populates the cache via cacheSet.

import { cacheGet } from "../services/cache.js";

export async function cacheBeforeDb(request, reply) {
  const cfg = request.routeOptions?.config?.cacheOnRequest;
  if (cfg === undefined || cfg === null || cfg === false) return;
  try {
    await request.jwtVerify();
  } catch {
    return;
  }
  const tenantId = request.user?.tenant_id ?? request.tenantId ?? null;
  const key = typeof cfg === "function" ? cfg(request) : cfg.key(request);
  if (!key) return;
  const cached = cacheGet(tenantId, key);
  if (cached !== undefined) return reply.send(cached);
}