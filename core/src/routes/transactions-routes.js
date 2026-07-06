import { z } from "zod";
import { listTransactions, revertTransaction } from "../services/transactions-service.js";
import { assertAdminPassword } from "../services/admin-confirmation-service.js";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  producto: z.string().optional(),
  tipo: z.enum(["entrada", "salida", "venta", "ajuste"]).optional(),
  revertida: z.enum(["0", "1"]).optional()
});

const revertSchema = z.object({
  password: z.string().min(1),
  motivo: z.string().optional()
});

export async function transactionsRoutes(app) {
  app.get("/", { preHandler: [app.requirePermission("reportes", "ver")] }, async (request) => {
    const query = querySchema.parse(request.query);
    return listTransactions(query);
  });

  app.post("/:id/revertir", { preHandler: [app.requirePermission("ventas", "eliminar")] }, async (request) => {
    const { password, motivo } = revertSchema.parse(request.body);
    assertAdminPassword(request.user.id, password);
    return revertTransaction({
      movimientoId: Number(request.params.id),
      usuarioId: request.user.id,
      motivo
    });
  });
}
