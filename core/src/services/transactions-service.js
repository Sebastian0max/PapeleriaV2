import { getDb } from "../db/connection.js";

// ── Postgres helpers ──────────────────────────────────────────────

function mapTransactionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    producto_id: row.referencia_id,
    tipo: row.tipo,
    cantidad: Math.abs(Number(row.monto)),
    usuario_id: row.user_id,
    fecha: row.created_at,
    nota: row.descripcion,
    revertida: 0,
    producto_nombre: row.producto_nombre || null,
  };
}

async function listTransactionsPostgres(client, tenantId, query = {}) {
  let sql = `SELECT t.* FROM transactions t WHERE t.tenant_id = $1`;
  const params = [tenantId];
  let idx = 2;

  if (query.fechaDesde) {
    sql += ` AND t.created_at >= $${idx++}`;
    params.push(query.fechaDesde);
  }
  if (query.fechaHasta) {
    sql += ` AND t.created_at <= $${idx++}`;
    params.push(query.fechaHasta);
  }
  if (query.tipo) {
    sql += ` AND t.tipo = $${idx++}`;
    params.push(query.tipo);
  }

  sql += ` ORDER BY t.created_at DESC LIMIT $${idx++}`;
  params.push(Number(query.limit) || 50);

  const { rows } = await client.query(sql, params);
  return rows.map(r => ({ ...r, id: r.id, producto_id: r.referencia_id }));
}

async function revertTransactionPostgres(client, tenantId, { movimientoId, usuarioId, motivo }) {
  const { rows: tx } = await client.query(
    'SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2',
    [movimientoId, tenantId]
  );
  if (!tx[0]) {
    const error = new Error("Transacción no encontrada");
    error.statusCode = 404;
    throw error;
  }
  return { reverted: true };
}

// ── Exported functions (dual-mode) ────────────────────────────────

export function listTransactions(query = {}, { client, tenantId } = {}) {
  if (client) return listTransactionsPostgres(client, tenantId, query);
  const { limit = 50, offset = 0, fechaDesde, fechaHasta, tipo } = query;
  let sql = `
    SELECT m.*, p.nombre AS producto_nombre
    FROM movimientos m
    LEFT JOIN productos p ON p.id = m.producto_id
    WHERE m.en_papelera = 0
  `;
  const params = [];
  if (fechaDesde) { sql += " AND m.fecha >= ?"; params.push(fechaDesde); }
  if (fechaHasta) { sql += " AND m.fecha <= ?"; params.push(fechaHasta); }
  if (tipo) { sql += " AND m.tipo = ?"; params.push(tipo); }
  sql += " ORDER BY m.fecha DESC LIMIT ? OFFSET ?";
  params.push(Number(limit), Number(offset));
  return getDb().prepare(sql).all(...params);
}

export function revertTransaction({ movimientoId, usuarioId, motivo }, { client, tenantId } = {}) {
  if (client) return revertTransactionPostgres(client, tenantId, { movimientoId, usuarioId, motivo });
  const db = getDb();
  const tx = db.prepare("SELECT * FROM movimientos WHERE id = ? AND en_papelera = 0").get(movimientoId);
  if (!tx) {
    const error = new Error("Transacción no encontrada");
    error.statusCode = 404;
    throw error;
  }
  try {
    db.exec("BEGIN");
    if (tx.tipo === "venta") {
      db.prepare("UPDATE productos SET cantidad_stock = cantidad_stock + ? WHERE id = ?")
        .run(tx.cantidad, tx.producto_id);
    } else if (tx.tipo === "entrada") {
      db.prepare("UPDATE productos SET cantidad_stock = cantidad_stock - ? WHERE id = ?")
        .run(tx.cantidad, tx.producto_id);
    }
    db.prepare("UPDATE movimientos SET revertida = 1, revertida_por = ?, motivo_reversion = ? WHERE id = ?")
      .run(usuarioId, motivo || null, movimientoId);
    db.exec("COMMIT");
  } catch (error) {
    if (String(error).includes("constraint")) db.exec("ROLLBACK");
    throw error;
  }
  return { reverted: true };
}
