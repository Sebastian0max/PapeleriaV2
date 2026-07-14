import bcrypt from "bcryptjs";
import { getDb } from "../db/connection.js";
import { listUserPermissions, listUserPermissionsPostgres } from "./permissions-service.js";

// ── Postgres helpers ──────────────────────────────────────────────

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    usuario: row.username,
    password_hash: row.password_hash,
    rol: row.rol_nombre || null,
    rol_id: row.rol_id,
    activo: row.activo ? 1 : 0,
    creado_en: row.created_at,
  };
}

async function findUserByUsernamePostgres(client, tenantId, username) {
  const { rows } = await client.query(
    `SELECT u.*, r.nombre AS rol_nombre
     FROM users u
     LEFT JOIN roles r ON r.id = u.rol_id
     WHERE u.username = $1 AND u.tenant_id = $2 AND u.activo = TRUE`,
    [username, tenantId]
  );
  return mapUserRow(rows[0]);
}

async function findUserByIdPostgres(client, tenantId, id) {
  const { rows } = await client.query(
    `SELECT u.*, r.nombre AS rol_nombre
     FROM users u
     LEFT JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1 AND u.tenant_id = $2 AND u.activo = TRUE`,
    [id, tenantId]
  );
  return mapUserRow(rows[0]);
}

async function listUsersPostgres(client, tenantId) {
  const { rows } = await client.query(
    `SELECT u.id, u.username AS usuario, u.activo, u.created_at AS creado_en, u.rol_id, r.nombre AS rol
     FROM users u
     LEFT JOIN roles r ON r.id = u.rol_id
     WHERE u.tenant_id = $1
     ORDER BY u.username`,
    [tenantId]
  );
  return rows;
}

async function createUserPostgres(client, tenantId, { usuario, password, rol_id }) {
  const { rows: role } = await client.query(
    'SELECT * FROM roles WHERE id = $1 AND tenant_id = $2',
    [rol_id, tenantId]
  );
  if (!role[0]) {
    const error = new Error("Rol no encontrado");
    error.statusCode = 400;
    throw error;
  }
  const hash = bcrypt.hashSync(password, 10);
  const { rows } = await client.query(
    `INSERT INTO users (tenant_id, username, password_hash, nombre, rol_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [tenantId, usuario, hash, usuario, rol_id]
  );
  const { rows: created } = await client.query(
    `SELECT u.id, u.username AS usuario, u.activo, u.rol_id, r.nombre AS rol
     FROM users u JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [rows[0].id]
  );
  return created[0];
}

async function updateUserPostgres(client, tenantId, id, { usuario, password, rol_id, activo }, currentUserId) {
  const { rows: existing } = await client.query(
    'SELECT * FROM users WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  if (!existing[0]) {
    const error = new Error("Usuario no encontrado");
    error.statusCode = 404;
    throw error;
  }
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    await client.query(
      `UPDATE users SET username = $1, password_hash = $2, rol_id = $3, activo = $4, updated_at = NOW()
       WHERE id = $5 AND tenant_id = $6`,
      [usuario, hash, rol_id, activo, id, tenantId]
    );
  } else {
    await client.query(
      `UPDATE users SET username = $1, rol_id = $2, activo = $3, updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5`,
      [usuario, rol_id, activo, id, tenantId]
    );
  }
  const { rows } = await client.query(
    `SELECT u.id, u.username AS usuario, u.activo, u.rol_id, r.nombre AS rol
     FROM users u JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [id]
  );
  return rows[0];
}

async function deactivateUserPostgres(client, tenantId, id, currentUserId) {
  const { rows } = await client.query(
    `UPDATE users SET activo = FALSE, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND activo = TRUE
     RETURNING id`,
    [id, tenantId]
  );
  if (!rows[0]) {
    const error = new Error("Usuario no encontrado");
    error.statusCode = 404;
    throw error;
  }
  const { rows: user } = await client.query(
    `SELECT u.id, u.username AS usuario, u.activo, u.rol_id, r.nombre AS rol
     FROM users u LEFT JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [id]
  );
  return user[0];
}

// ── Exported functions (dual-mode) ────────────────────────────────

export function findUserById(id, { client, tenantId } = {}) {
  if (client) return findUserByIdPostgres(client, tenantId, id);
  return getDb().prepare(`
    SELECT u.*, COALESCE(r.nombre, u.rol) AS rol_nombre
    FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ? AND u.activo = 1
  `).get(id);
}

export function findUserByUsername(usuario, { client, tenantId } = {}) {
  if (client) return findUserByUsernamePostgres(client, tenantId, usuario);
  return getDb().prepare(`
    SELECT u.*, COALESCE(r.nombre, u.rol) AS rol_nombre
    FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id
    WHERE u.usuario = ? AND u.activo = 1
  `).get(usuario);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function listUsers({ client, tenantId } = {}) {
  if (client) return listUsersPostgres(client, tenantId);
  return getDb().prepare(`
    SELECT u.id, u.usuario, u.activo, u.creado_en, u.rol_id, COALESCE(r.nombre, u.rol) AS rol
    FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id
    ORDER BY u.usuario
  `).all();
}

export function createUser({ usuario, password, rol_id }, { client, tenantId } = {}) {
  if (client) return createUserPostgres(client, tenantId, { usuario, password, rol_id });
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
    FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = ?
  `).get(result.lastInsertRowid);
}

export function updateUser(id, { usuario, password, rol_id, activo }, currentUserId, { client, tenantId } = {}) {
  if (client) return updateUserPostgres(client, tenantId, id, { usuario, password, rol_id, activo }, currentUserId);
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
    db.prepare(`UPDATE usuarios SET usuario = ?, password_hash = ?, rol = ?, rol_id = ?, activo = ? WHERE id = ?`)
      .run(usuario, bcrypt.hashSync(password, 10), role.nombre, rol_id, activo ? 1 : 0, id);
  } else {
    db.prepare(`UPDATE usuarios SET usuario = ?, rol = ?, rol_id = ?, activo = ? WHERE id = ?`)
      .run(usuario, role.nombre, rol_id, activo ? 1 : 0, id);
  }
  return db.prepare(`
    SELECT u.id, u.usuario, u.activo, u.rol_id, r.nombre AS rol
    FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = ?
  `).get(id);
}

export function deactivateUser(id, currentUserId, { client, tenantId } = {}) {
  if (client) return deactivateUserPostgres(client, tenantId, id, currentUserId);
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
    FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id WHERE u.id = ?
  `).get(id);
}

export async function getSessionUser(user, { client, tenantId } = {}) {
  return {
    id: user.id,
    usuario: user.usuario,
    rol: user.rol_nombre || user.rol,
    rol_id: user.rol_id,
    permisos: client ? await listUserPermissionsPostgres(client, tenantId, user.id) : listUserPermissions(user.id)
  };
}

export async function getUserSessionById(id, { client, tenantId } = {}) {
  if (client) return getUserSessionByIdPostgres(client, tenantId, id);
  const user = getDb().prepare(`
    SELECT u.*, COALESCE(r.nombre, u.rol) AS rol_nombre
    FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ? AND u.activo = 1
  `).get(id);
  if (!user) {
    const error = new Error("Usuario no encontrado");
    error.statusCode = 404;
    throw error;
  }
  return getSessionUser(user);
}

async function getUserSessionByIdPostgres(client, tenantId, id) {
  const user = await findUserByIdPostgres(client, tenantId, id);
  if (!user) {
    const error = new Error("Usuario no encontrado");
    error.statusCode = 404;
    throw error;
  }
  return getSessionUser(user, { client, tenantId });
}
