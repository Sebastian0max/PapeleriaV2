import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth-routes.js";
import { importRoutes } from "./routes/import-routes.js";
import { productRoutes } from "./routes/products-routes.js";
import { reportsRoutes } from "./routes/reports-routes.js";
import { roleRoutes } from "./routes/roles-routes.js";
import { salesRoutes } from "./routes/sales-routes.js";
import { transactionsRoutes } from "./routes/transactions-routes.js";
import { userRoutes } from "./routes/users-routes.js";
import { getUserWithPermissions, hasPermission } from "./services/permissions-service.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { 
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });
  app.register(jwt, { secret: config.jwtSecret });
  app.register(multipart, {
    limits: {
      fileSize: 2 * 1024 * 1024
    }
  });

  app.decorate("authenticate", async (request) => {
    await request.jwtVerify();
  });

  app.decorate("requirePermission", (modulo, accion) => async (request) => {
    await request.jwtVerify();
    if (!hasPermission(request.user.id, modulo, accion)) {
      const error = new Error("No tienes permiso para realizar esta accion");
      error.statusCode = 403;
      throw error;
    }
  });

  app.decorate("requireAdminPermission", (modulo, accion) => async (request) => {
    await request.jwtVerify();
    const dbUser = getUserWithPermissions(request.user.id);
    if (dbUser?.rol !== "admin" || !hasPermission(request.user.id, modulo, accion)) {
      const error = new Error("Esta funcion solo esta disponible para admin");
      error.statusCode = 403;
      throw error;
    }
  });

  app.get("/health", async () => ({ ok: true }));
  app.get("/uploads/productos/:file", async (request, reply) => {
    const file = path.basename(request.params.file);
    const fullPath = path.join(config.uploadsDir, "productos", file);
    if (!fs.existsSync(fullPath)) return reply.code(404).send({ message: "Archivo no encontrado" });
    const ext = path.extname(file).toLowerCase();
    const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return reply.type(type).send(fs.createReadStream(fullPath));
  });
  app.register(authRoutes, { prefix: "/auth" });
  app.register(productRoutes, { prefix: "/productos" });
  app.register(salesRoutes, { prefix: "/ventas" });
  app.register(transactionsRoutes, { prefix: "/transacciones" });
  app.register(reportsRoutes, { prefix: "/reportes" });
  app.register(userRoutes, { prefix: "/usuarios" });
  app.register(roleRoutes, { prefix: "/roles" });
  app.register(importRoutes, { prefix: "/importaciones" });

  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode || 500;
    request.log.error(error);
    reply.code(status).send({ message: error.message || "Error interno" });
  });

  return app;
}
