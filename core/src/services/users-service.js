import bcrypt from "bcryptjs";
import { getDb } from "../db/connection.js";
import { listUserPermissions } from "./permissions-service.js";

export function findUserById(id) {
  return getDb().prepare(`
    SELECT u.*, COALESCE(r.nombre, u.rol) AS rol_nombre
    FROM usuarios u
    LEFT JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ? AND u.activo = 1
  `).get(id);
}

export function findUserByUsername(usuario) {
  return getDb().prepare(`
    SELECT u.*, COALESCE(r.nombre, u.rol) AS rol_nombre
    FROM usuarios u
    LEFT JOIN roles r ON r.id = u.rol_id
    WHERE u.usuario = ? AND u.activo = 1
  `).get(usuario);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function listUsers() {
  return getDb().prepare(`
    SELECT u.id, u.usuario, u.activo, u.creado_en, u.rol_id, COALESCE(r.nombre, u.rol) AS rol
    FROM usuarios u
    LEFT JOIN roles r ON r.id = u.rol_id
    ORDER BY u.usuario
  `).all();
}

export function createUser({ usuario, password, rol_id }) {
  const role = getDb().prepare("SELECT * FROM roles WHERE id = ? AND activo = 1").get(rol_id);
  if (!role) {
    const error = new Error("Rol no encontrado");
    error.statusCode = 400;
    throw error;
  }

  const result = getDb().prepare(`
    INSERT INTO usuarios (usuario, password_hash, rol, rol_id)
    VALUES (?, ?, ?, ?)
  `).run(usuario, bcrypt.hashSync(password, 10), role.nombre, rol_id);

  return getDb().prepare(`
    SELECT u.id, u.usuario, u.activo, u.rol_id, r.nombre AS rol
    FROM usuarios u JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ?
  `).get(result.lastInsertRowid);
}

export function updateUser(id, { usuario, password, rol_id, activo }, currentUserId) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(id);
  if (!existing) {
    const error = new Error("Usuario no encontrado");
    error.statusCode = 404;
    throw error;
  }

  if (Number(id) === Number(currentUserId) && activo === false) {
    const error = new Error("No puedes desactivar tu propio usuario");
    error.statusCode = 409;
    throw error;
  }

  const role = db.prepare("SELECT * FROM roles WHERE id = ? AND activo = 1").get(rol_id);
  if (!role) {
    const error = new Error("Rol no encontrado");
    error.statusCode = 400;
    throw error;
  }

  if (Number(id) === Number(currentUserId) && role.nombre !== "admin") {
    const error = new Error("No puedes quitarte el rol admin a ti mismo");
    error.statusCode = 409;
    throw error;
  }

  if (password) {
    db.prepare(`
      UPDATE usuarios SET usuario = ?, password_hash = ?, rol = ?, rol_id = ?, activo = ?
      WHERE id = ?
    `).run(usuario, bcrypt.hashSync(password, 10), role.nombre, rol_id, activo ? 1 : 0, id);
  } else {
    db.prepare(`
      UPDATE usuarios SET usuario = ?, rol = ?, rol_id = ?, activo = ?
      WHERE id = ?
    `).run(usuario, role.nombre, rol_id, activo ? 1 : 0, id);
  }

  return db.prepare(`
    SELECT u.id, u.usuario, u.activo, u.rol_id, r.nombre AS rol
    FROM usuarios u JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ?
  `).get(id);
}

export function deactivateUser(id, currentUserId) {
  if (Number(id) === Number(currentUserId)) {
    const error = new Error("No puedes desactivar tu propio usuario");
    error.statusCode = 409;
    throw error;
  }

  const result = getDb().prepare("UPDATE usuarios SET activo = 0 WHERE id = ?").run(id);
  if (result.changes === 0) {
    const error = new Error("Usuario no encontrado");
    error.statusCode = 404;
    throw error;
  }
  return getDb().prepare(`
    SELECT u.id, u.usuario, u.activo, u.rol_id, COALESCE(r.nombre, u.rol) AS rol
    FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ?
  `).get(id);
}

export function getSessionUser(user) {
  return {
    id: user.id,
    usuario: user.usuario,
    rol: user.rol_nombre,
    rol_id: user.rol_id,
    permisos: listUserPermissions(user.id)
  };
}

export function getUserSessionById(id) {
  const user = getDb().prepare(`
    SELECT u.*, COALESCE(r.nombre, u.rol) AS rol_nombre
    FROM usuarios u
    LEFT JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ? AND u.activo = 1
  `).get(id);
  if (!user) {
    const error = new Error("Usuario no encontrado");
    error.statusCode = 404;
    throw error;
  }
  return getSessionUser(user);
}
