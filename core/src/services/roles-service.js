import { getDb } from "../db/connection.js";

// ── Postgres helpers ──────────────────────────────────────────────

async function listRolesPostgres(client, tenantId) {
  const { rows } = await client.query(
    `SELECT r.*, COUNT(u.id)::INTEGER AS user_count
     FROM roles r
     LEFT JOIN users u ON u.rol_id = r.id AND u.tenant_id = $1
     WHERE r.tenant_id = $1
     GROUP BY r.id ORDER BY r.nombre`,
    [tenantId]
  );
  return rows;
}

async function listPermissionsPostgres(client) {
  const { rows } = await client.query('SELECT * FROM permisos ORDER BY codigo');
  return rows;
}

async function createRolePostgres(client, tenantId, { nombre, permisos }) {
  const { rows } = await client.query(
    `INSERT INTO roles (tenant_id, nombre) VALUES ($1, $2) RETURNING *`,
    [tenantId, nombre]
  );
  if (permisos && permisos.length > 0) {
    const permRows = await client.query(
      `SELECT id FROM permisos WHERE codigo = ANY($1)`,
      [permisos]
    );
    for (const perm of permRows.rows) {
      await client.query(
        `INSERT INTO rol_permisos (tenant_id, rol_id, permiso_id) VALUES ($1, $2, $3)`,
        [tenantId, rows[0].id, perm.id]
      );
    }
  }
  return rows[0];
}

async function updateRolePostgres(client, tenantId, id, { nombre, permisos }) {
  const { rows } = await client.query(
    `UPDATE roles SET nombre = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [nombre, id, tenantId]
  );
  if (!rows[0]) {
    const error = new Error("Rol no encontrado");
    error.statusCode = 404;
    throw error;
  }
  if (permisos) {
    await client.query(
      'DELETE FROM rol_permisos WHERE rol_id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    const permRows = await client.query(
      `SELECT id FROM permisos WHERE codigo = ANY($1)`,
      [permisos]
    );
    for (const perm of permRows.rows) {
      await client.query(
        `INSERT INTO rol_permisos (tenant_id, rol_id, permiso_id) VALUES ($1, $2, $3)`,
        [tenantId, id, perm.id]
      );
    }
  }
  return rows[0];
}

// ── Exported functions (dual-mode) ────────────────────────────────

export function listRoles({ client, tenantId } = {}) {
  if (client) return listRolesPostgres(client, tenantId);
  return getDb().prepare("SELECT * FROM roles WHERE activo = 1 ORDER BY nombre").all();
}

export function listPermissions({ client, tenantId } = {}) {
  if (client) return listPermissionsPostgres(client);
  return getDb().prepare("SELECT * FROM permisos ORDER BY modulo, accion").all();
}

export function createRole({ nombre, permisos }, { client, tenantId } = {}) {
  if (client) return createRolePostgres(client, tenantId, { nombre, permisos });
  const db = getDb();
  const result = db.prepare("INSERT INTO roles (nombre) VALUES (?)").run(nombre);
  const roleId = result.lastInsertRowid;
  if (permisos && permisos.length > 0) {
    const insert = db.prepare("INSERT INTO rol_permisos (rol_id, permiso_id) VALUES (?, (SELECT id FROM permisos WHERE modulo = ? AND accion = ?))");
    for (const key of permisos) {
      const [mod, acc] = key.split(":");
      insert.run(roleId, mod, acc);
    }
  }
  return db.prepare("SELECT * FROM roles WHERE id = ?").get(roleId);
}

export function updateRole(id, { nombre, permisos }, { client, tenantId } = {}) {
  if (client) return updateRolePostgres(client, tenantId, id, { nombre, permisos });
  const db = getDb();
  db.prepare("UPDATE roles SET nombre = ? WHERE id = ? AND activo = 1").run(nombre, id);
  if (permisos) {
    db.prepare("DELETE FROM rol_permisos WHERE rol_id = ?").run(id);
    const insert = db.prepare("INSERT INTO rol_permisos (rol_id, permiso_id) VALUES (?, (SELECT id FROM permisos WHERE modulo = ? AND accion = ?))");
    for (const key of permisos) {
      const [mod, acc] = key.split(":");
      insert.run(id, mod, acc);
    }
  }
  return db.prepare("SELECT * FROM roles WHERE id = ?").get(id);
}
