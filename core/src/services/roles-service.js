import { getDb } from "../db/connection.js";

export function listPermissions() {
  return getDb().prepare("SELECT * FROM permisos ORDER BY modulo, accion").all();
}

export function listRoles() {
  const db = getDb();
  const roles = db.prepare("SELECT * FROM roles WHERE activo = 1 ORDER BY nombre").all();
  const permissions = db.prepare(`
    SELECT rp.rol_id, p.modulo || ':' || p.accion AS permiso
    FROM rol_permisos rp
    JOIN permisos p ON p.id = rp.permiso_id
  `).all();

  return roles.map((role) => ({
    ...role,
    permisos: permissions.filter((item) => item.rol_id === role.id).map((item) => item.permiso)
  }));
}

export function createRole({ nombre, permisos }) {
  const db = getDb();
  let id;
  const tx = () => {
    db.exec("BEGIN");
    const result = db.prepare("INSERT INTO roles (nombre, es_sistema) VALUES (?, 0)").run(nombre);
    id = result.lastInsertRowid;
    replaceRolePermissions(db, id, permisos);
    db.exec("COMMIT");
  };
  try {
    tx();
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return listRoles().find((role) => role.id === id);
}

export function updateRole(id, { nombre, permisos }) {
  const db = getDb();
  const role = db.prepare("SELECT * FROM roles WHERE id = ?").get(id);
  if (!role) {
    const error = new Error("Rol no encontrado");
    error.statusCode = 404;
    throw error;
  }
  if (role.nombre === "admin") {
    ensureAdminSafety(permisos);
  }

  const tx = () => {
    db.exec("BEGIN");
    db.prepare("UPDATE roles SET nombre = ? WHERE id = ?").run(nombre, id);
    replaceRolePermissions(db, id, permisos);
    db.exec("COMMIT");
  };

  try {
    tx();
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return listRoles().find((item) => item.id === Number(id));
}

function replaceRolePermissions(db, roleId, permisos) {
  db.prepare("DELETE FROM rol_permisos WHERE rol_id = ?").run(roleId);
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id)
    SELECT ?, id FROM permisos WHERE modulo = ? AND accion = ?
  `);
  for (const key of permisos || []) {
    const [modulo, accion] = key.split(":");
    stmt.run(roleId, modulo, accion);
  }
}

function ensureAdminSafety(permisos) {
  const required = ["configuracion:ver", "usuarios:ver", "roles:ver", "importacion:ver"];
  for (const key of required) {
    if (!permisos.includes(key)) {
      const error = new Error("El rol admin debe conservar acceso a Configuracion");
      error.statusCode = 409;
      throw error;
    }
  }
}
