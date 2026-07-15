import { z } from "zod";
import { createSale, listSales, deleteSale } from "../services/sales-service.js";

const saleSchema = z.object({
  productoId: z.coerce.number().int().positive(),
  cantidad: z.coerce.number().int().positive(),
  precio_unitario: z.coerce.number().positive().optional()
});

export async function salesRoutes(app) {
  app.get("/", { preHandler: [app.requirePermission("ventas", "ver")] }, async (request) => {
    return { sales: await listSales({ client: request.client, tenantId: request.tenantId }) };
  });

  app.post("/", { preHandler: [app.requirePermission("ventas", "crear")] }, async (request) => {
    const input = saleSchema.parse(request.body);
    return { sale: await createSale({ ...input, usuarioId: request.user.id, client: request.client, tenantId: request.tenantId }) };
  });

  app.delete("/:id", { preHandler: [app.requirePermission("ventas", "eliminar")] }, async (request) => {
    return await deleteSale(Number(request.params.id), request.user.id, { client: request.client, tenantId: request.tenantId });
  });
}
