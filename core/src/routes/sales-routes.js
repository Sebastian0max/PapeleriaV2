import { z } from "zod";
import { createSale, listSales, deleteSale } from "../services/sales-service.js";
import { cacheGet, cacheSet, invalidateCache } from "../services/cache.js";

const saleSchema = z.object({
  productoId: z.string().min(1),
  cantidad: z.coerce.number().int().positive()
});

export async function salesRoutes(app) {
  app.get("/", { config: { cacheOnRequest: { key: () => "ventas:list" } }, preHandler: [app.requirePermission("ventas", "ver")] }, async (request) => {
    const cached = cacheGet(request.tenantId, "ventas:list");
    if (cached) return cached;
    return cacheSet(request.tenantId, "ventas:list", { sales: await listSales({ client: request.client, tenantId: request.tenantId }) });
  });

  app.post("/", { preHandler: [app.requirePermission("ventas", "crear")] }, async (request) => {
    const input = saleSchema.parse(request.body);
    invalidateCache(request.tenantId);
    return { sale: await createSale({ ...input, usuarioId: request.user.id, client: request.client, tenantId: request.tenantId }) };
  });

  app.delete("/:id", { preHandler: [app.requirePermission("ventas", "eliminar")] }, async (request) => {
    invalidateCache(request.tenantId);
    return await deleteSale(request.params.id, request.user.id, { client: request.client, tenantId: request.tenantId });
  });
}
