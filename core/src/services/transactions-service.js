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
    revertida: row.revertida ? 1 : 0,
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
  if (query.revertida === "0") {
    sql += ` AND (t.revertida IS NULL OR t.revertida = 0)`;
  } else if (query.revertida === "1") {
    sql += ` AND t.revertida = 1`;
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
  if (tx[0].revertida) {
    const error = new Error("Esta transacción ya fue revertida");
    error.statusCode = 400;
    throw error;
  }
  return { reverted: true };
}

// ── Exported functions (dual-mode) ────────────────────────────────

export function listTransactions(query = {}, { client, tenantId } = {}) {
  if (client) return listTransactionsPostgres(client, tenantId, query);
  const { limit = 50, offset = 0, fechaDesde, fechaHasta, tipo, revertida } = query;
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
  if (revertida === "0") {
    sql += " AND (m.revertida IS NULL OR m.revertida = 0)";
  } else if (revertida === "1") {
    sql += " AND m.revertida = 1";
  }
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
  if (tx.revertida) {
    const error = new Error("Esta transacción ya fue revertida");
    error.statusCode = 400;
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

async function restoreTransactionPostgres(client, tenantId, { movimientoId, usuarioId, motivo }) {
  const { rows: tx } = await client.query(
    'SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2',
    [movimientoId, tenantId]
  );
  if (!tx[0]) {
    const error = new Error("Transacción no encontrada");
    error.statusCode = 404;
    throw error;
  }
  if (!tx[0].revertida) {
    const error = new Error("Esta transacción no está cancelada");
    error.statusCode = 400;
    throw error;
  }
  await client.query("BEGIN");
  try {
    if (tx[0].tipo === "venta") {
      await client.query("UPDATE productos SET cantidad_stock = cantidad_stock - $1 WHERE id = $2 AND tenant_id = $3",
        [Math.abs(Number(tx[0].monto)), tx[0].referencia_id, tenantId]);
    } else if (tx[0].tipo === "entrada") {
      await client.query("UPDATE productos SET cantidad_stock = cantidad_stock + $1 WHERE id = $2 AND tenant_id = $3",
        [Math.abs(Number(tx[0].monto)), tx[0].referencia_id, tenantId]);
    }
    await client.query("UPDATE transactions SET revertida = 0, revertida_por = NULL, motivo_reversion = NULL WHERE id = $1",
      [movimientoId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  return { restored: true };
}

export function restoreTransaction({ movimientoId, usuarioId, motivo }, { client, tenantId } = {}) {
  if (client) return restoreTransactionPostgres(client, tenantId, { movimientoId, usuarioId, motivo });
  const db = getDb();
  const tx = db.prepare("SELECT * FROM movimientos WHERE id = ? AND en_papelera = 0").get(movimientoId);
  if (!tx) {
    const error = new Error("Transacción no encontrada");
    error.statusCode = 404;
    throw error;
  }
  if (!tx.revertida) {
    const error = new Error("Esta transacción no está cancelada");
    error.statusCode = 400;
    throw error;
  }
  try {
    db.exec("BEGIN");
    if (tx.tipo === "venta") {
      db.prepare("UPDATE productos SET cantidad_stock = cantidad_stock - ? WHERE id = ?")
        .run(tx.cantidad, tx.producto_id);
    } else if (tx.tipo === "entrada") {
      db.prepare("UPDATE productos SET cantidad_stock = cantidad_stock + ? WHERE id = ?")
        .run(tx.cantidad, tx.producto_id);
    }
    db.prepare("UPDATE movimientos SET revertida = 0, revertida_por = NULL, motivo_reversion = NULL WHERE id = ?")
      .run(movimientoId);
    db.exec("COMMIT");
  } catch (error) {
    if (String(error).includes("constraint")) db.exec("ROLLBACK");
    throw error;
  }
  return { restored: true };
}

export function purgeOldCanceled(days = 7) {
  const db = getDb();
  const old = db.prepare(`
    SELECT m.*, p.nombre AS producto_nombre
    FROM movimientos m
    LEFT JOIN productos p ON p.id = m.producto_id
    WHERE m.revertida = 1 AND m.en_papelera = 0
    AND julianday('now') - julianday(m.fecha) >= ?
  `).all(days);
  const count = old.length;
  if (count > 0) {
    const insertAudit = db.prepare(`
      INSERT INTO bitacora_auditoria (usuario_id, entidad, entidad_id, accion, detalle)
      VALUES (0, 'movimiento', ?, 'purga_auto', ?)
    `);
    const deleteMov = db.prepare("DELETE FROM movimientos WHERE id = ?");
    for (const mov of old) {
      const detalle = JSON.stringify({
        tipo: mov.tipo,
        producto: mov.producto_nombre || mov.producto_id,
        cantidad: mov.cantidad,
        fecha: mov.fecha,
        revertida_por: mov.revertida_por,
        motivo_reversion: mov.motivo_reversion
      });
      insertAudit.run(mov.id, detalle);
      deleteMov.run(mov.id);
    }
  }
  return { purged: count };
}
