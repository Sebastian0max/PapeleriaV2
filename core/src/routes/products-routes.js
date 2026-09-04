import { z } from "zod";
import { createProduct, deleteProduct, listProducts, listTrashProducts, restoreProduct, purgeOldTrash, updateProduct, updateProductImage, updateStock } from "../services/products-service.js";
import { cacheGet, cacheSet, invalidateCache } from "../services/cache.js";

const productSchema = z.object({
  nombre: z.string().min(1),
  sku: z.string().optional().nullable(),
  categoria: z.string().optional().nullable(),
  cantidad_stock: z.coerce.number().int().nonnegative().default(0),
  stock_minimo: z.coerce.number().int().nonnegative().default(0),
  precio: z.coerce.number().int().nonnegative(),
  costo: z.coerce.number().int().nonnegative().default(0)
}).extend({
  codigo_barras: z.string().optional().nullable(),
  imagen_url: z.string().optional().nullable()
});

const movementSchema = z.object({
  tipo: z.enum(["entrada", "salida"]),
  cantidad: z.coerce.number().int().positive(),
  nota: z.string().optional()
});

export async function productRoutes(app) {
  app.get("/", { config: { cacheOnRequest: { key: (r) => `productos:list:${r.query.search || ""}` } }, preHandler: [app.requirePermission("productos", "ver")] }, async (request) => {
    const searchKey = request.query.search || "";
    const key = `productos:list:${searchKey}`;
    const cached = cacheGet(request.tenantId, key);
    if (cached) return cached;
    return cacheSet(request.tenantId, key, { products: await listProducts({ search: searchKey, client: request.client, tenantId: request.tenantId }) });
  });

  app.post("/", { preHandler: [app.requireAdminPermission("productos", "crear")] }, async (request) => {
    invalidateCache(request.tenantId);
    return { product: await createProduct(productSchema.parse(request.body), { client: request.client, tenantId: request.tenantId }) };
  });

  app.put("/:id", { preHandler: [app.requireAdminPermission("productos", "editar")] }, async (request) => {
    invalidateCache(request.tenantId);
    const id = request.client ? request.params.id : Number(request.params.id);
    return { product: await updateProduct(id, productSchema.partial().parse(request.body), request.user.id, { client: request.client, tenantId: request.tenantId }) };
  });

  app.delete("/:id", { preHandler: [app.requireAdminPermission("productos", "eliminar")] }, async (request) => {
    invalidateCache(request.tenantId);
    const id = request.client ? request.params.id : Number(request.params.id);
    const result = await deleteProduct(id, request.user.id, { client: request.client, tenantId: request.tenantId });
    return { ...result, message: "Producto movido a la papelera." };
  });

  app.get("/papelera", { preHandler: [app.requireAdminPermission("productos", "ver")] }, async (request) => {
    return { products: await listTrashProducts({ client: request.client, tenantId: request.tenantId }) };
  });

  app.post("/:id/restaurar", { preHandler: [app.requireAdminPermission("productos", "editar")] }, async (request) => {
    invalidateCache(request.tenantId);
    const id = request.client ? request.params.id : Number(request.params.id);
    return await restoreProduct(id, request.user.id, { client: request.client, tenantId: request.tenantId });
  });

  app.post("/purgar", { preHandler: [app.requireAdminPermission("productos", "eliminar")] }, async (request) => {
    invalidateCache(request.tenantId);
    return await purgeOldTrash(7, { client: request.client, tenantId: request.tenantId });
  });

  app.post("/:id/imagen", { preHandler: [app.requireAdminPermission("productos", "editar")] }, async (request) => {
    invalidateCache(request.tenantId);
    const file = await request.file();
    const id = request.client ? request.params.id : Number(request.params.id);
    return { product: await updateProductImage(id, file, { client: request.client, tenantId: request.tenantId }) };
  });

  app.post("/:id/movimientos", { preHandler: [app.requireAdminPermission("stock", "crear")] }, async (request) => {
    invalidateCache(request.tenantId);
    const input = movementSchema.parse(request.body);
    const id = request.client ? request.params.id : Number(request.params.id);
    return { product: await updateStock({ productoId: id, tipo: input.tipo, cantidad: input.cantidad, usuarioId: request.user.id, nota: input.nota, client: request.client, tenantId: request.tenantId }) };
  });
}
