import { z } from "zod";
import { findUserByUsername, getSessionUser, getUserSessionById, verifyPassword } from "../services/users-service.js";

const loginSchema = z.object({
  usuario: z.string().min(1),
  password: z.string().min(1)
});

export async function authRoutes(app) {
  app.post("/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = findUserByUsername(input.usuario);

    if (!user || !verifyPassword(input.password, user.password_hash)) {
      return reply.code(401).send({ message: "Usuario o password incorrectos" });
    }

    const sessionUser = getSessionUser(user);
    const token = app.jwt.sign({ id: user.id, usuario: user.usuario, rol: sessionUser.rol });
    return { token, user: sessionUser };
  });

  app.get("/me", { preHandler: [app.authenticate] }, async (request) => {
    return { user: getUserSessionById(request.user.id) };
  });
}
