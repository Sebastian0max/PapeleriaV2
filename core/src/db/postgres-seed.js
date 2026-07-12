export async function provisionTenant(client, subdomain, nombre) {
  const { rows } = await client.query(
    `INSERT INTO tenants (subdomain, nombre)
     VALUES ($1, $2)
     ON CONFLICT (subdomain) DO UPDATE SET nombre = EXCLUDED.nombre
     RETURNING id`,
    [subdomain, nombre]
  );
  return rows[0].id;
}

export async function seedDefaultPermissions(client) {
  const permisos = [
    ["productos_ver", "Ver productos"],
    ["productos_crear", "Crear productos"],
    ["productos_editar", "Editar productos"],
    ["productos_eliminar", "Eliminar productos"],
    ["clientes_ver", "Ver clientes"],
    ["clientes_crear", "Crear clientes"],
    ["clientes_editar", "Editar clientes"],
    ["clientes_eliminar", "Eliminar clientes"],
    ["ventas_ver", "Ver ventas"],
    ["ventas_crear", "Crear ventas"],
    ["ventas_editar", "Editar ventas"],
    ["ventas_eliminar", "Eliminar ventas"],
    ["compras_ver", "Ver compras"],
    ["compras_crear", "Crear compras"],
    ["compras_editar", "Editar compras"],
    ["compras_eliminar", "Eliminar compras"],
    ["usuarios_ver", "Ver usuarios"],
    ["usuarios_crear", "Crear usuarios"],
    ["usuarios_editar", "Editar usuarios"],
    ["usuarios_eliminar", "Eliminar usuarios"],
    ["roles_ver", "Ver roles"],
    ["roles_crear", "Crear roles"],
    ["roles_editar", "Editar roles"],
    ["roles_eliminar", "Eliminar roles"],
    ["reportes_ver", "Ver reportes"],
    ["config_ver", "Ver configuración"],
    ["config_editar", "Editar configuración"],
    ["importar", "Importar datos"],
    ["exportar", "Exportar datos"],
    ["backup_crear", "Crear backups"],
    ["backup_restaurar", "Restaurar backups"],
    ["auditoria_ver", "Ver auditoría"],
  ];

  for (const [codigo, descripcion] of permisos) {
    await client.query(
      `INSERT INTO permisos (codigo, descripcion)
       VALUES ($1, $2)
       ON CONFLICT (codigo) DO NOTHING`,
      [codigo, descripcion]
    );
  }
}

export async function seedAdminRoleWithPermissions(client, tenantId) {
  const { rows: existing } = await client.query(
    `SELECT id FROM roles WHERE tenant_id = $1 AND nombre = 'admin' AND es_sistema = TRUE`,
    [tenantId]
  );
  let roleId;
  if (existing[0]) {
    roleId = existing[0].id;
  } else {
    const { rows } = await client.query(
      `INSERT INTO roles (tenant_id, nombre, descripcion, es_sistema, activo)
       VALUES ($1, 'admin', 'Rol administrador con todos los permisos', TRUE, TRUE)
       RETURNING id`,
      [tenantId]
    );
    roleId = rows[0].id;
  }

  const { rows: allPerms } = await client.query(`SELECT id FROM permisos`);
  for (const perm of allPerms) {
    await client.query(
      `INSERT INTO rol_permisos (tenant_id, rol_id, permiso_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [tenantId, roleId, perm.id]
    );
  }
}
