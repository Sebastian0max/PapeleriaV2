import { z } from "zod";
import { createRole, listPermissions, listRoles, updateRole } from "../services/roles-service.js";

const roleSchema = z.object({
  nombre: z.string().min(2),
  permisos: z.array(z.string()).default([])
});

export async function roleRoutes(app) {
  app.get("/", { preHandler: [app.requireAdminPermission("roles", "ver")] }, async (request) => {
    return { roles: await listRoles({ client: request.client, tenantId: request.tenantId }), permissions: await listPermissions({ client: request.client, tenantId: request.tenantId }) };
  });

  app.post("/", { preHandler: [app.requireAdminPermission("roles", "crear")] }, async (request) => {
    return { role: await createRole(roleSchema.parse(request.body), { client: request.client, tenantId: request.tenantId }) };
  });

  app.put("/:id", { preHandler: [app.requireAdminPermission("roles", "editar")] }, async (request) => {
    return { role: await updateRole(Number(request.params.id), roleSchema.parse(request.body), { client: request.client, tenantId: request.tenantId }) };
  });
}
