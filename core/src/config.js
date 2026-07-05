import path from "node:path";

export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "127.0.0.1",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  dbPath: process.env.PAPELERIA_DB || path.resolve(process.cwd(), "core", "data", "papeleria.db"),
  uploadsDir: process.env.PAPELERIA_UPLOADS || path.resolve(process.cwd(), "uploads")
};
