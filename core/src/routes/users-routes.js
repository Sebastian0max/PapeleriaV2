import { z } from "zod";
import { createUser, deactivateUser, listUsers, updateUser } from "../services/users-service.js";

const userSchema = z.object({
  usuario: z.string().min(2),
  password: z.string().min(6).optional(),
  rol_id: z.coerce.number().int().positive(),
  activo: z.boolean().default(true)
});

const createSchema = userSchema.extend({
  password: z.string().min(6)
});

export async function userRoutes(app) {
  app.get("/", { preHandler: [app.requireAdminPermission("usuarios", "ver")] }, async () => {
    return { users: listUsers() };
  });

  app.post("/", { preHandler: [app.requireAdminPermission("usuarios", "crear")] }, async (request) => {
    return { user: createUser(createSchema.parse(request.body)) };
  });

  app.put("/:id", { preHandler: [app.requireAdminPermission("usuarios", "editar")] }, async (request) => {
    return { user: updateUser(Number(request.params.id), userSchema.parse(request.body), request.user.id) };
  });

  app.delete("/:id", { preHandler: [app.requireAdminPermission("usuarios", "eliminar")] }, async (request) => {
    const user = deactivateUser(Number(request.params.id), request.user.id);
    return { user, deactivated: true };
  });
}
