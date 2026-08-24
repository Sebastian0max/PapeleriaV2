import { getDb } from "../db/connection.js";

// ── Postgres helpers ──────────────────────────────────────────────

function mapVentaRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    producto_id: row.producto_id,
    cantidad: Number(row.cantidad),
    precio_unitario: Number(row.precio_unitario),
    total: Number(row.total),
    usuario_id: row.user_id,
    anulada: row.estatus === "anulada" ? 1 : 0,
    fecha: row.created_at,
    producto_nombre: row.producto_nombre,
    usuario: row.usuario,
  };
}

async function createSalePostgres(client, tenantId, { productoId, cantidad, usuarioId }) {
  const { rows: product } = await client.query(
    'SELECT * FROM productos WHERE id = $1 AND tenant_id = $2 AND activo = TRUE',
    [productoId, tenantId]
  );
  if (!product[0]) {
    const error = new Error("No se pudo completar la venta: el producto no existe.");
    error.statusCode = 404;
    throw error;
  }
  const p = product[0];
  if (Number(p.stock) < cantidad) {
    const error = new Error(`No se pudo completar la venta: solo hay ${p.stock} unidades disponibles.`);
    error.statusCode = 409;
    throw error;
  }
  const total = Number(p.precio_venta) * cantidad;
  const folio = `VTA-${Date.now()}`;
  const { rows: venta } = await client.query(
    `INSERT INTO ventas (tenant_id, folio, user_id, total, forma_pago, estatus)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, folio, usuarioId, total, "efectivo", "completada"]
  );
  await client.query(
    `INSERT INTO ventas_detalle (tenant_id, venta_id, producto_id, cantidad, precio_unitario, subtotal)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, venta[0].id, productoId, cantidad, p.precio_venta, total]
  );
  await client.query(
    `UPDATE productos SET stock = stock - $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
    [cantidad, productoId, tenantId]
  );
  return {
    ...venta[0],
    producto_nombre: p.nombre,
    usuario: null,
    producto_id: productoId,
    cantidad,
    precio_unitario: p.precio_venta,
  };
}

async function listSalesPostgres(client, tenantId) {
  const { rows } = await client.query(
    `SELECT v.*, p.nombre AS producto_nombre, u.nombre AS usuario
     FROM ventas v
     JOIN productos p ON p.id = ANY(SELECT producto_id FROM ventas_detalle WHERE venta_id = v.id)
     LEFT JOIN users u ON u.id = v.user_id
     WHERE v.tenant_id = $1 AND v.estatus = 'completada'
     ORDER BY v.created_at DESC
     LIMIT 100`,
    [tenantId]
  );
  return rows.map(r => mapVentaRow({ ...r, producto_id: r.id }));
}

async function deleteSalePostgres(client, tenantId, ventaId, usuarioId) {
  const { rows: venta } = await client.query(
    'SELECT * FROM ventas WHERE id = $1 AND tenant_id = $2',
    [ventaId, tenantId]
  );
  if (!venta[0]) {
    const error = new Error("Venta no encontrada");
    error.statusCode = 404;
    throw error;
  }
  const { rows: detalle } = await client.query(
    'SELECT * FROM ventas_detalle WHERE venta_id = $1 AND tenant_id = $2',
    [ventaId, tenantId]
  );
  for (const item of detalle) {
    await client.query(
      `UPDATE productos SET stock = stock + $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [item.cantidad, item.producto_id, tenantId]
    );
  }
  await client.query(
    `UPDATE ventas SET estatus = 'anulada' WHERE id = $1 AND tenant_id = $2`,
    [ventaId, tenantId]
  );
  return { deleted: true };
}

// ── Exported functions (dual-mode) ────────────────────────────────

export function createSale({ productoId, cantidad, usuarioId, client, tenantId } = {}) {
  if (client) return createSalePostgres(client, tenantId, { productoId, cantidad, usuarioId });
  const db = getDb();
  if (!productoId || typeof cantidad === "undefined" || cantidad === null) {
    const error = new Error("No se pudo completar la venta: la cantidad ingresada no es válida.");
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    const error = new Error("No se pudo completar la venta: la cantidad ingresada no es válida.");
    error.statusCode = 400;
    throw error;
  }
  const product = db.prepare("SELECT * FROM productos WHERE id = ?").get(productoId);
  if (!product) {
    const error = new Error("No se pudo completar la venta: el producto no existe.");
    error.statusCode = 404;
    throw error;
  }
  if (!product.activo) {
    const error = new Error("No se pudo completar la venta: este producto ya no está disponible.");
    error.statusCode = 409;
    throw error;
  }
  if (!product.precio || product.precio <= 0) {
    const error = new Error("No se pudo completar la venta: el producto no tiene un precio válido configurado.");
    error.statusCode = 409;
    throw error;
  }
  if (product.cantidad_stock < cantidad) {
    const error = new Error(`No se pudo completar la venta: solo hay ${product.cantidad_stock} unidades disponibles.`);
    error.statusCode = 409;
    throw error;
  }
  const total = product.precio * cantidad;
  let ventaId;
  try {
    db.exec("BEGIN");
    db.prepare("UPDATE productos SET cantidad_stock = cantidad_stock - ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?")
      .run(cantidad, productoId);
    const sale = db.prepare("INSERT INTO ventas (producto_id, cantidad, precio_unitario, total, usuario_id) VALUES (?, ?, ?, ?, ?)")
      .run(productoId, cantidad, product.precio, total, usuarioId);
    ventaId = sale.lastInsertRowid;
    db.prepare("INSERT INTO movimientos (producto_id, tipo, cantidad, usuario_id, nota) VALUES (?, 'venta', ?, ?, ?)")
      .run(productoId, cantidad, usuarioId, `Venta #${ventaId}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return db.prepare("SELECT v.*, p.nombre AS producto_nombre FROM ventas v JOIN productos p ON p.id = v.producto_id WHERE v.id = ?")
    .get(ventaId);
}

export function listSales({ client, tenantId } = {}) {
  if (client) return listSalesPostgres(client, tenantId);
  return getDb().prepare(`
    SELECT v.*, p.nombre AS producto_nombre, u.usuario
    FROM ventas v JOIN productos p ON p.id = v.producto_id JOIN usuarios u ON u.id = v.usuario_id
    WHERE v.anulada = 0 ORDER BY v.fecha DESC LIMIT 100
  `).all();
}

export function deleteSale(ventaId, usuarioId, { client, tenantId } = {}) {
  if (client) return deleteSalePostgres(client, tenantId, ventaId, usuarioId);
  const db = getDb();
  const venta = db.prepare("SELECT * FROM ventas WHERE id = ?").get(ventaId);
  if (!venta) {
    const error = new Error("Venta no encontrada");
    error.statusCode = 404;
    throw error;
  }
  if (venta.anulada) {
    const error = new Error("La venta ya esta anulada");
    error.statusCode = 400;
    throw error;
  }
  try {
    db.exec("BEGIN");
    db.prepare("UPDATE productos SET cantidad_stock = cantidad_stock + ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?")
      .run(venta.cantidad, venta.producto_id);
    db.prepare("INSERT INTO movimientos (producto_id, tipo, cantidad, usuario_id, nota) VALUES (?, 'entrada', ?, ?, ?)")
      .run(venta.producto_id, venta.cantidad, usuarioId, `Anulacion de venta #${venta.id}`);
    db.prepare("UPDATE ventas SET anulada = 1 WHERE id = ?").run(venta.id);
    db.prepare("INSERT INTO bitacora_auditoria (usuario_id, entidad, entidad_id, accion, detalle) VALUES (?, 'venta', ?, 'eliminar', 'Anulacion de venta y restauracion de stock')")
      .run(usuarioId, venta.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { deleted: true };
}
