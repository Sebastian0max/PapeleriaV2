import { z } from "zod";
import { listTransactions } from "../services/transactions-service.js";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  producto: z.string().optional()
});

export async function transactionsRoutes(app) {
  app.get("/", { preHandler: [app.requirePermission("reportes", "ver")] }, async (request) => {
    const query = querySchema.parse(request.query);
    return listTransactions(query);
  });
}
