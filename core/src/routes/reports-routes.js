import { getStockReport, getProfitReport, getProfitEvolution } from "../services/reports-service.js";

export async function reportsRoutes(app) {
  app.get("/stock", { preHandler: [app.requirePermission("reportes", "ver")] }, async () => {
    return getStockReport();
  });

  app.get("/ganancias", { preHandler: [app.requirePermission("reportes", "ver")] }, async (request) => {
    const periodo = request.query.periodo || "mes";
    return getProfitReport(periodo);
  });

  app.get("/ganancias/evolucion", { preHandler: [app.requirePermission("reportes", "ver")] }, async () => {
    return getProfitEvolution();
  });
}
