import { getStockReport } from "../services/reports-service.js";

export async function reportsRoutes(app) {
  app.get("/stock", { preHandler: [app.requirePermission("reportes", "ver")] }, async () => {
    return getStockReport();
  });
}
