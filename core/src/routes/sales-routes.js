import { z } from "zod";
import { createSale, listSales, deleteSale } from "../services/sales-service.js";

const saleSchema = z.object({
  productoId: z.coerce.number().int().positive(),
  cantidad: z.coerce.number().int().positive()
});

export async function salesRoutes(app) {
  app.get("/", { preHandler: [app.requirePermission("ventas", "ver")] }, async () => {
    return { sales: listSales() };
  });

  app.post("/", { preHandler: [app.requirePermission("ventas", "crear")] }, async (request) => {
    const input = saleSchema.parse(request.body);
    return { sale: createSale({ ...input, usuarioId: request.user.id }) };
  });

  app.delete("/:id", { preHandler: [app.requirePermission("ventas", "eliminar")] }, async (request) => {
    const result = deleteSale(Number(request.params.id), request.user.id);
    return result;
  });

}
