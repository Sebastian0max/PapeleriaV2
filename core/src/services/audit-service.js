import { getDb } from "../db/connection.js";

export function logAudit({ usuarioId, entidad, entidadId, accion, campo, valorAnterior, valorNuevo, detalle, client, tenantId } = {}) {
  if (client && tenantId) {
    return logAuditPostgres(client, tenantId, { usuarioId, entidad, entidadId, accion, campo, valorAnterior, valorNuevo, detalle });
  }
  getDb().prepare(`
    INSERT INTO bitacora_auditoria (usuario_id, entidad, entidad_id, accion, campo, valor_anterior, valor_nuevo, detalle)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(usuarioId, entidad, entidadId, accion, campo || null, valueToText(valorAnterior), valueToText(valorNuevo), detalle || null);
}

async function logAuditPostgres(client, tenantId, { usuarioId, entidad, entidadId, accion, campo, valorAnterior, valorNuevo, detalle }) {
  await client.query(
    `INSERT INTO audit_log (tenant_id, user_id, accion, entidad, entidad_id, detalle)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, usuarioId, accion, entidad, entidadId, detalle ? JSON.stringify(detalle) : null]
  );
}

export function logProductChanges({ usuarioId, productId, accion, before, after, detalle, client, tenantId } = {}) {
  const fields = ["nombre", "codigo_barras", "sku", "categoria", "cantidad_stock", "stock_minimo", "precio", "activo"];
  let count = 0;
  for (const field of fields) {
    if (String(before?.[field] ?? "") !== String(after?.[field] ?? "")) {
      logAudit({ usuarioId, entidad: "producto", entidadId: productId, accion, campo: field, valorAnterior: before?.[field], valorNuevo: after?.[field], detalle, client, tenantId });
      count += 1;
    }
  }
  if (count === 0 && detalle) {
    logAudit({ usuarioId, entidad: "producto", entidadId: productId, accion, detalle, client, tenantId });
  }
}

function valueToText(value) {
  if (value == null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}
