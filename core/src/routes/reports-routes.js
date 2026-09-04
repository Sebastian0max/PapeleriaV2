import { getStockReport, getProfitReport, getProfitEvolution } from "../services/reports-service.js";
import { cacheGet, cacheSet } from "../services/cache.js";

export async function reportsRoutes(app) {
  app.get("/stock", { preHandler: [app.requirePermission("reportes", "ver")] }, async (request) => {
    const cached = cacheGet(request.tenantId, "reportes:stock");
    if (cached) return cached;
    return cacheSet(request.tenantId, "reportes:stock", await getStockReport({ client: request.client, tenantId: request.tenantId }));
  });

  app.get("/ganancias", { preHandler: [app.requirePermission("reportes", "ver")] }, async (request) => {
    const periodo = request.query.periodo || "mes";
    const key = `reportes:ganancias:${periodo}`;
    const cached = cacheGet(request.tenantId, key);
    if (cached) return cached;
    return cacheSet(request.tenantId, key, await getProfitReport(periodo, { client: request.client, tenantId: request.tenantId }));
  });

  app.get("/ganancias/evolucion", { preHandler: [app.requirePermission("reportes", "ver")] }, async (request) => {
    const cached = cacheGet(request.tenantId, "reportes:ganancias:evolucion");
    if (cached) return cached;
    return cacheSet(request.tenantId, "reportes:ganancias:evolucion", await getProfitEvolution({ client: request.client, tenantId: request.tenantId }));
  });
}
