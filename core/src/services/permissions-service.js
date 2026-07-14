import { getDb } from "../db/connection.js";

// ── Postgres helpers ──────────────────────────────────────────────

export async function getUserWithPermissionsPostgres(client, tenantId, userId) {
  const { rows } = await client.query(
    `SELECT u.*, r.nombre AS rol
     FROM users u
     JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1 AND u.tenant_id = $2`,
    [userId, tenantId]
  );
  if (!rows[0]) return null;
  const user = rows[0];
  const { rows: perms } = await client.query(
    `SELECT p.codigo FROM permisos p
     JOIN rol_permisos rp ON rp.permiso_id = p.id
     WHERE rp.rol_id = $1 AND rp.tenant_id = $2`,
    [user.rol_id, tenantId]
  );
  return {
    ...user,
    id: user.id,
    usuario: user.username,
    permisos: perms.map(p => p.codigo),
  };
}

export async function hasPermissionPostgres(client, tenantId, userId, modulo, accion) {
  const { rows } = await client.query(
    `SELECT 1 FROM rol_permisos rp
     JOIN permisos p ON p.id = rp.permiso_id
     JOIN users u ON u.rol_id = rp.rol_id
     WHERE u.id = $1 AND u.tenant_id = $2 AND rp.tenant_id = $2
       AND p.codigo = $3`,
    [userId, tenantId, `${modulo}_${accion}`]
  );
  return rows.length > 0;
}

// ── Exported functions (dual-mode) ────────────────────────────────

export function getUserWithPermissions(userId, { client, tenantId } = {}) {
  if (client) return getUserWithPermissionsPostgres(client, tenantId, userId);
  const user = getDb().prepare(`
    SELECT u.*, r.nombre AS rol
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ?
  `).get(userId);
  if (!user) return null;
  return { ...user, permisos: listUserPermissions(userId) };
}

export function hasPermission(userId, modulo, accion, { client, tenantId } = {}) {
  if (client) return hasPermissionPostgres(client, tenantId, userId, modulo, accion);
  const perm = getDb().prepare(`
    SELECT 1 AS ok FROM rol_permisos rp
    JOIN permisos p ON p.id = rp.permiso_id
    JOIN roles r ON r.id = rp.rol_id
    JOIN usuarios u ON u.rol_id = r.id
    WHERE u.id = ? AND p.modulo = ? AND p.accion = ?
  `).get(userId, modulo, accion);
  return !!perm;
}

export function listUserPermissions(userId) {
  return getDb().prepare(`
    SELECT p.modulo || ':' || p.accion AS permiso
    FROM rol_permisos rp
    JOIN permisos p ON p.id = rp.permiso_id
    JOIN roles r ON r.id = rp.rol_id
    JOIN usuarios u ON u.rol_id = r.id
    WHERE u.id = ?
  `).all(userId).map(r => r.permiso);
}

export async function listUserPermissionsPostgres(client, tenantId, userId) {
  const { rows } = await client.query(
    `SELECT p.codigo FROM permisos p
     JOIN rol_permisos rp ON rp.permiso_id = p.id
     JOIN users u ON u.rol_id = rp.rol_id
     WHERE u.id = $1 AND u.tenant_id = $2`,
    [userId, tenantId]
  );
  return rows.map(r => r.codigo);
}
