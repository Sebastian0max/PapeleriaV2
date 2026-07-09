import { getStockReport, getProfitReport, getProfitEvolution } from "../services/reports-service.js";

export async function reportsRoutes(app) {
  app.get("/stock", { preHandler: [app.requirePermission("reportes", "ver")] }, async (request) => {
    return await getStockReport({ client: request.client, tenantId: request.tenantId });
  });

  app.get("/ganancias", { preHandler: [app.requirePermission("reportes", "ver")] }, async (request) => {
    const periodo = request.query.periodo || "mes";
    return await getProfitReport(periodo, { client: request.client, tenantId: request.tenantId });
  });

  app.get("/ganancias/evolucion", { preHandler: [app.requirePermission("reportes", "ver")] }, async (request) => {
    return await getProfitEvolution({ client: request.client, tenantId: request.tenantId });
  });
}
