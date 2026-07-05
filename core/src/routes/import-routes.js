import { applyImportPreview, buildImportPreview, listImportLogs, parseImportFile, templateCsv } from "../services/import-service.js";

export async function importRoutes(app) {
  app.get("/plantilla", { preHandler: [app.requireAdminPermission("importacion", "ver")] }, async (request, reply) => {
    return reply
      .header("Content-Disposition", "attachment; filename=plantilla-productos.csv")
      .type("text/csv")
      .send(templateCsv());
  });

  app.post("/preview", { preHandler: [app.requireAdminPermission("importacion", "crear")] }, async (request) => {
    const file = await request.file();
    const parsed = await parseImportFile(file);
    return { preview: buildImportPreview({ ...parsed, adminId: request.user.id }) };
  });

  app.post("/confirmar", { preHandler: [app.requireAdminPermission("importacion", "crear")] }, async (request) => {
    return { result: applyImportPreview(request.body.token, request.user.id) };
  });

  app.get("/bitacora", { preHandler: [app.requireAdminPermission("importacion", "ver")] }, async (request) => {
    return { logs: listImportLogs(request.query) };
  });
}
