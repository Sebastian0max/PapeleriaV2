import { getDb } from "../db/connection.js";

// ── Postgres helpers ──────────────────────────────────────────────

async function listTransactionsPostgres(client, tenantId, query = {}) {
  let sql = `
    SELECT t.*, p.nombre AS producto_nombre, u.nombre AS usuario_nombre, ru.nombre AS reverter_nombre
    FROM transactions t
    LEFT JOIN productos p ON p.id = t.referencia_id AND t.referencia_tipo = 'producto'
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN users ru ON ru.id = t.revertida_por
    WHERE t.tenant_id = $1
  `;
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
  if (query.revertida === "1") {
    sql += ` AND t.revertida = true`;
  } else if (query.revertida === "0") {
    sql += ` AND (t.revertida = false OR t.revertida IS NULL)`;
  }

  sql += ` ORDER BY t.created_at DESC LIMIT $${idx++}`;
  params.push(Number(query.limit) || 50);

  if (query.offset) {
    sql += ` OFFSET $${idx++}`;
    params.push(Number(query.offset) || 0);
  }

  const { rows } = await client.query(sql, params);
  return { transactions: rows.map(r => ({
    id: r.id,
    producto_id: r.referencia_id,
    producto_nombre: r.producto_nombre || null,
    tipo: r.tipo,
    cantidad: Math.abs(Number(r.monto)),
    fecha: r.created_at,
    nota: r.descripcion,
    usuario_id: r.user_id,
    usuario_nombre: r.usuario_nombre || null,
    revertida: r.revertida,
    revertida_por_usuario: r.reverter_nombre || null,
    motivo_reversion: r.motivo_reversion || null,
  })) };
}

async function revertTransactionPostgres(client, tenantId, { movimientoId, usuarioId, motivo }) {
  const { rows: txRow } = await client.query(
    'SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2',
    [movimientoId, tenantId]
  );
  const tx = txRow[0];
  if (!tx) {
    const error = new Error("Transacción no encontrada");
    error.statusCode = 404;
    throw error;
  }
  if (tx.revertida) {
    const error = new Error("La transacción ya está cancelada");
    error.statusCode = 400;
    throw error;
  }
  if (tx.referencia_id && tx.referencia_tipo === 'producto') {
    const delta = tx.tipo === 'venta' || tx.tipo === 'salida' ? tx.monto : -tx.monto;
    await client.query(
      `UPDATE productos SET stock = stock + $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [delta, tx.referencia_id, tenantId]
    );
  }
  await client.query(
    `UPDATE transactions SET revertida = true, revertida_por = $1, motivo_reversion = $2 WHERE id = $3 AND tenant_id = $4`,
    [usuarioId, motivo || null, movimientoId, tenantId]
  );
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

// ── Weekly purge: archive & delete old cancelled transactions ──────

async function purgeOldCancelledPostgres(client, tenantId) {
  const { rows: old } = await client.query(
    `SELECT * FROM transactions WHERE tenant_id = $1 AND revertida = true AND created_at < NOW() - INTERVAL '7 days'`,
    [tenantId]
  );
  if (old.length === 0) return { purged: 0 };

  for (const tx of old) {
    await client.query(
      `INSERT INTO audit_log (tenant_id, user_id, accion, entidad, entidad_id, detalle)
       VALUES ($1, $2, 'purge_cancelled', 'transactions', $3, $4)`,
      [tenantId, tx.revertida_por || tx.user_id, tx.id, JSON.stringify({
        tipo: tx.tipo, referencia_id: tx.referencia_id, referencia_tipo: tx.referencia_tipo,
        monto: tx.monto, descripcion: tx.descripcion, created_at: tx.created_at,
        motivo_reversion: tx.motivo_reversion
      })]
    );
  }

  const { rowCount } = await client.query(
    `DELETE FROM transactions WHERE tenant_id = $1 AND revertida = true AND created_at < NOW() - INTERVAL '7 days'`,
    [tenantId]
  );
  return { purged: rowCount };
}

function purgeOldCancelledSqlite(db) {
  const { changes } = db.prepare(
    `DELETE FROM movimientos WHERE revertida = 1 AND fecha < datetime('now', '-7 days')`
  ).run();
  return { purged: changes };
}

export function purgeOldCancelled({ client, tenantId } = {}) {
  if (client) return purgeOldCancelledPostgres(client, tenantId);
  return purgeOldCancelledSqlite(getDb());
}
