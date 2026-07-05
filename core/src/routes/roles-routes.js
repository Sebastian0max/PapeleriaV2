import { z } from "zod";
import { createRole, listPermissions, listRoles, updateRole } from "../services/roles-service.js";

const roleSchema = z.object({
  nombre: z.string().min(2),
  permisos: z.array(z.string()).default([])
});

export async function roleRoutes(app) {
  app.get("/", { preHandler: [app.requireAdminPermission("roles", "ver")] }, async () => {
    return { roles: listRoles(), permissions: listPermissions() };
  });

  app.post("/", { preHandler: [app.requireAdminPermission("roles", "crear")] }, async (request) => {
    return { role: createRole(roleSchema.parse(request.body)) };
  });

  app.put("/:id", { preHandler: [app.requireAdminPermission("roles", "editar")] }, async (request) => {
    return { role: updateRole(Number(request.params.id), roleSchema.parse(request.body)) };
  });
}
