import bcrypt from "bcryptjs";
import { getDb } from "../db/connection.js";

const estados = new Map();

export function crearConfirmacion(id, data, timeoutMs = 30000) {
  const entry = { data, resuelto: false, rechazado: false, timeout: null };
  estados.set(id, entry);

  return new Promise((resolve, reject) => {
    entry.timeout = setTimeout(() => {
      if (!entry.resuelto && !entry.rechazado) {
        entry.rechazado = true;
        estados.delete(id);
        reject(new Error("Tiempo de confirmación agotado"));
      }
    }, timeoutMs);

    entry.resolve = (valor) => {
      if (!entry.rechazado) {
        entry.resuelto = true;
        clearTimeout(entry.timeout);
        estados.delete(id);
        resolve(valor);
      }
    };

    entry.reject = (razon) => {
      if (!entry.resuelto) {
        entry.rechazado = true;
        clearTimeout(entry.timeout);
        estados.delete(id);
        reject(razon);
      }
    };
  });
}

export function confirmar(id, valor) {
  const entry = estados.get(id);
  if (entry && entry.resolve) {
    entry.resolve(valor);
    return true;
  }
  return false;
}

export function rechazar(id, razon) {
  const entry = estados.get(id);
  if (entry && entry.reject) {
    entry.reject(razon);
    return true;
  }
  return false;
}

export function obtenerPendiente(id) {
  const entry = estados.get(id);
  return entry ? entry.data : null;
}

export async function assertAdminPassword(userId, password, client, tenantId) {
  let user;
  if (client) {
    const { rows } = await client.query('SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND activo = TRUE', [userId, tenantId]);
    user = rows[0] || null;
  } else {
    user = getDb().prepare("SELECT * FROM usuarios WHERE id = ? AND activo = 1").get(userId);
  }
  if (!user) {
    const error = new Error("Usuario no encontrado");
    error.statusCode = 404;
    throw error;
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    const error = new Error("Contraseña incorrecta");
    error.statusCode = 403;
    throw error;
  }
}
