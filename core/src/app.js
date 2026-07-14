import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth-routes.js";
import { exportRoutes } from "./routes/export-routes.js";
import { importRoutes } from "./routes/import-routes.js";
import { productRoutes } from "./routes/products-routes.js";
import { reportsRoutes } from "./routes/reports-routes.js";
import { roleRoutes } from "./routes/roles-routes.js";
import { salesRoutes } from "./routes/sales-routes.js";
import { transactionsRoutes } from "./routes/transactions-routes.js";
import { userRoutes } from "./routes/users-routes.js";
import { getUserWithPermissions, hasPermission } from "./services/permissions-service.js";
import { initSentry } from "./services/sentry.js";

const isPostgres = !!process.env.SUPABASE_DATABASE_URL;

function registerRoutes(instance) {
  instance.register(authRoutes, { prefix: "/auth" });
  instance.register(exportRoutes, { prefix: "/exportar" });
  instance.register(productRoutes, { prefix: "/productos" });
  instance.register(salesRoutes, { prefix: "/ventas" });
  instance.register(transactionsRoutes, { prefix: "/transacciones" });
  instance.register(reportsRoutes, { prefix: "/reportes" });
  instance.register(userRoutes, { prefix: "/usuarios" });
  instance.register(roleRoutes, { prefix: "/roles" });
  instance.register(importRoutes, { prefix: "/importaciones" });
}

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });
  app.register(jwt, { secret: config.jwtSecret });
  app.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024 }
  });

  app.decorate("authenticate", async (request) => {
    await request.jwtVerify();
  });

  app.decorate("requirePermission", (modulo, accion) => async (request) => {
    await request.jwtVerify();
    if (!await hasPermission(request.user.id, modulo, accion, { client: request.client, tenantId: request.tenantId })) {
      const error = new Error("No tienes permiso para realizar esta accion");
      error.statusCode = 403;
      throw error;
    }
  });

  app.decorate("requireAdminPermission", (modulo, accion) => async (request) => {
    await request.jwtVerify();
    const dbUser = await getUserWithPermissions(request.user.id, { client: request.client, tenantId: request.tenantId });
    if (dbUser?.rol !== "admin" || !await hasPermission(request.user.id, modulo, accion, { client: request.client, tenantId: request.tenantId })) {
      const error = new Error("Esta funcion solo esta disponible para admin");
      error.statusCode = 403;
      throw error;
    }
  });

  app.get("/health", async (request) => {
    let dbStatus = 'sqlite';
    if (isPostgres && request.client) {
      try {
        const r = await request.client.query('SELECT $1::text as t', ['hello']);
        dbStatus = `pg:${r.rows[0].t}`;
      } catch (e) {
        dbStatus = `pg:${e.message}`;
      }
    }
    return { ok: true, db: dbStatus };
  });
  app.get("/uploads/productos/:file", async (request, reply) => {
    const file = path.basename(request.params.file);
    const fullPath = path.join(config.uploadsDir, "productos", file);
    if (!fs.existsSync(fullPath)) return reply.code(404).send({ message: "Archivo no encontrado" });
    const ext = path.extname(file).toLowerCase();
    const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return reply.type(type).send(fs.createReadStream(fullPath));
  });

  if (isPostgres) {
    app.register(async function pgScope(instance) {
      const { tenantResolver } = await import("./middleware/tenant-resolver.js");
      const { withDb } = await import("./middleware/with-db.js");
      instance.addHook("onRequest", tenantResolver);
      instance.addHook("onRequest", withDb);
      registerRoutes(instance);
    });
  } else {
    registerRoutes(app);
  }

  initSentry(app);

  return app;
}
