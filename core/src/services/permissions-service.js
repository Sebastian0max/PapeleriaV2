import { getDb } from "../db/connection.js";

export function getUserWithPermissions(userId) {
  return getDb().prepare(`
    SELECT u.id, u.usuario, u.activo, u.rol AS rol_legacy, r.id AS rol_id, r.nombre AS rol
    FROM usuarios u
    LEFT JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ? AND u.activo = 1
  `).get(userId);
}

export function listUserPermissions(userId) {
  return getDb().prepare(`
    SELECT p.modulo || ':' || p.accion AS permiso
    FROM usuarios u
    JOIN rol_permisos rp ON rp.rol_id = u.rol_id
    JOIN permisos p ON p.id = rp.permiso_id
    WHERE u.id = ? AND u.activo = 1
    ORDER BY p.modulo, p.accion
  `).all(userId).map((row) => row.permiso);
}

export function hasPermission(userId, modulo, accion) {
  const user = getUserWithPermissions(userId);
  if (!user) return false;
  if (user.rol === "admin" || user.rol_legacy === "admin") return true;

  const found = getDb().prepare(`
    SELECT 1
    FROM usuarios u
    JOIN rol_permisos rp ON rp.rol_id = u.rol_id
    JOIN permisos p ON p.id = rp.permiso_id
    WHERE u.id = ? AND p.modulo = ? AND p.accion = ?
    LIMIT 1
  `).get(userId, modulo, accion);

  return Boolean(found);
}
