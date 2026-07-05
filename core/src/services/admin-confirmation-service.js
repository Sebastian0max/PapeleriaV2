import { findUserById, verifyPassword } from "./users-service.js";

const attempts = new Map();
const MAX_ATTEMPTS = 3;
const LOCK_MS = 30_000;

export function assertAdminPassword(userId, password) {
  const state = attempts.get(userId);
  const now = Date.now();
  if (state?.lockedUntil && state.lockedUntil > now) {
    const error = new Error("Demasiados intentos fallidos. Espera 30 segundos e intenta de nuevo.");
    error.statusCode = 429;
    throw error;
  }

  const user = findUserById(userId);
  if (!user || user.rol_nombre !== "admin") {
    const error = new Error("Solo un admin puede confirmar esta accion");
    error.statusCode = 403;
    throw error;
  }
  if (!password || !verifyPassword(password, user.password_hash)) {
    const nextFailures = (state?.failures || 0) + 1;
    attempts.set(userId, {
      failures: nextFailures,
      lockedUntil: nextFailures >= MAX_ATTEMPTS ? now + LOCK_MS : 0
    });
    const error = new Error(nextFailures >= MAX_ATTEMPTS
      ? "Password incorrecto. Bloqueado por 30 segundos."
      : "Password de administrador incorrecto.");
    error.statusCode = nextFailures >= MAX_ATTEMPTS ? 429 : 401;
    throw error;
  }

  attempts.delete(userId);
  return true;
}
