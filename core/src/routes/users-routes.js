import { z } from "zod";
import { createUser, deactivateUser, listUsers, updateUser } from "../services/users-service.js";

const userSchema = z.object({
  usuario: z.string().min(2),
  password: z.string().min(6).optional(),
  rol_id: z.union([z.number().int().positive(), z.string().min(1)]),
  activo: z.boolean().default(true)
});

const createSchema = userSchema.extend({
  password: z.string().min(6)
});

export async function userRoutes(app) {
  app.get("/", { preHandler: [app.requireAdminPermission("usuarios", "ver")] }, async (request) => {
    return { users: await listUsers({ client: request.client, tenantId: request.tenantId }) };
  });

  app.post("/", { preHandler: [app.requireAdminPermission("usuarios", "crear")] }, async (request) => {
    return { user: await createUser(createSchema.parse(request.body), { client: request.client, tenantId: request.tenantId }) };
  });

  app.put("/:id", { preHandler: [app.requireAdminPermission("usuarios", "editar")] }, async (request) => {
    const id = request.client ? request.params.id : Number(request.params.id);
    return { user: await updateUser(id, userSchema.parse(request.body), request.user.id, { client: request.client, tenantId: request.tenantId }) };
  });

  app.delete("/:id", { preHandler: [app.requireAdminPermission("usuarios", "eliminar")] }, async (request) => {
    const id = request.client ? request.params.id : Number(request.params.id);
    const user = await deactivateUser(id, request.user.id, { client: request.client, tenantId: request.tenantId });
    return { user, deactivated: true };
  });
}
