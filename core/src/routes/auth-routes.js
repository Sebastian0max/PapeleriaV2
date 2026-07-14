import { z } from "zod";
import { findUserByUsername, getSessionUser, getUserSessionById, verifyPassword } from "../services/users-service.js";
import { checkRateLimit, resetRateLimit } from "../services/rate-limiter.js";

const loginSchema = z.object({
  usuario: z.string().min(1),
  password: z.string().min(1)
});

export async function authRoutes(app) {
  app.post("/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const ip = request.ip || request.headers["x-forwarded-for"] || "unknown";
    const rl = checkRateLimit(`login:${ip}`);
    if (!rl.allowed) {
      return reply.code(429).send({ message: `Demasiados intentos. Espera ${rl.retryAfter}s.` });
    }
    const user = await findUserByUsername(input.usuario, { client: request.client, tenantId: request.tenantId });
    if (!user || !verifyPassword(input.password, user.password_hash)) {
      return reply.code(401).send({ message: "Usuario o password incorrectos" });
    }
    resetRateLimit(`login:${ip}`);
    const sessionUser = await getSessionUser(user, { client: request.client, tenantId: request.tenantId });
    const token = app.jwt.sign({ id: user.id, usuario: user.usuario, rol: sessionUser.rol });
    return { token, user: sessionUser };
  });

  app.get("/me", { preHandler: [app.authenticate] }, async (request) => {
    return { user: await getUserSessionById(request.user.id, { client: request.client, tenantId: request.tenantId }) };
  });
}
