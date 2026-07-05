import { z } from "zod";
import { createProduct, deleteProduct, listProducts, updateProduct, updateProductImage, updateStock } from "../services/products-service.js";

const productSchema = z.object({
  nombre: z.string().min(1),
  sku: z.string().optional().nullable(),
  categoria: z.string().optional().nullable(),
  cantidad_stock: z.coerce.number().int().nonnegative().default(0),
  stock_minimo: z.coerce.number().int().nonnegative().default(0),
  precio: z.coerce.number().int().nonnegative()
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
  app.get("/", { preHandler: [app.requirePermission("productos", "ver")] }, async (request) => {
    return { products: listProducts({ search: request.query.search || "" }) };
  });

  app.post("/", { preHandler: [app.requireAdminPermission("productos", "crear")] }, async (request) => {
    return { product: createProduct(productSchema.parse(request.body)) };
  });

  app.put("/:id", { preHandler: [app.requireAdminPermission("productos", "editar")] }, async (request) => {
    console.log(`[API] PUT /productos/${request.params.id}`, request.body);
    const result = updateProduct(Number(request.params.id), productSchema.partial().parse(request.body), request.user.id);
    console.log(`[API] PUT result for ${request.params.id}:`, result);
    return { product: result };
  });

  app.delete("/:id", { preHandler: [app.requireAdminPermission("productos", "eliminar")] }, async (request) => {
    console.log(`[API] DELETE /productos/${request.params.id} by user ${request.user.id}`);
    const result = deleteProduct(Number(request.params.id), request.user.id);
    console.log(`[API] DELETE result for ${request.params.id}:`, result);
    if (result.deactivated) {
      return {
        ...result,
        message: "Este producto no se puede eliminar porque tiene transacciones registradas. Se desactivo en su lugar."
      };
    }
    return { ...result, message: "Producto eliminado correctamente." };
  });

  app.post("/:id/imagen", { preHandler: [app.requireAdminPermission("productos", "editar")] }, async (request) => {
    const file = await request.file();
    return { product: await updateProductImage(Number(request.params.id), file) };
  });

  app.post("/:id/movimientos", { preHandler: [app.requireAdminPermission("stock", "crear")] }, async (request) => {
    const input = movementSchema.parse(request.body);
    return {
      product: updateStock({
        productoId: Number(request.params.id),
        tipo: input.tipo,
        cantidad: input.cantidad,
        usuarioId: request.user.id,
        nota: input.nota
      })
    };
  });
}
