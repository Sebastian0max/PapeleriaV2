import { getDb } from "../db/connection.js";
import { logAudit, logProductChanges } from "./audit-service.js";

// ── Postgres helpers ──────────────────────────────────────────────

function mapProductRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    sku: row.sku || row.codigo || null,
    codigo_barras: row.codigo_barras || null,
    categoria: row.categoria || null,
    cantidad_stock: Number(row.stock),
    stock_minimo: Number(row.stock_minimo),
    precio: Number(row.precio_venta),
    costo: Number(row.precio_compra),
    activo: row.activo ? 1 : 0,
    imagen_url: null,
    thumbnail_url: null,
    en_papelera: row.en_papelera ? 1 : 0,
    creado_en: row.created_at,
    actualizado_en: row.updated_at,
    fecha_eliminacion: row.fecha_eliminacion || null,
    eliminado_por: row.eliminado_por || null,
  };
}

async function listProductsPostgres(client, tenantId, search) {
  const term = `%${search}%`;
  const { rows } = await client.query(
    `SELECT * FROM productos
     WHERE tenant_id = $1 AND activo = TRUE AND en_papelera = FALSE
       AND ($2 = '%%' OR nombre ILIKE $2 OR codigo ILIKE $2 OR codigo_barras ILIKE $2 OR nombre_normalizado ILIKE $2 OR categoria ILIKE $2)
     ORDER BY COALESCE(categoria, 'General') ASC, nombre ASC`,
    [tenantId, term]
  );
  return rows.map(mapProductRow);
}

async function createProductPostgres(client, tenantId, input) {
  const nombre = String(input.nombre || "").trim();
  const nombreNormalizado = String(nombre).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  const { rows } = await client.query(
    `INSERT INTO productos (tenant_id, codigo, sku, codigo_barras, nombre, nombre_normalizado, categoria, precio_compra, precio_venta, stock, stock_minimo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [tenantId, input.sku || null, input.sku || null, input.codigo_barras || null, nombre, nombreNormalizado,
     input.categoria || null, input.costo || 0, input.precio || 0, input.cantidad_stock || 0, input.stock_minimo || 0]
  );
  return mapProductRow(rows[0]);
}

async function updateProductPostgres(client, tenantId, id, input, usuarioId) {
  const { rows: existing } = await client.query(
    'SELECT * FROM productos WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  if (!existing[0]) {
    const error = new Error("Producto no encontrado");
    error.statusCode = 404;
    throw error;
  }
  const before = existing[0];

  const nombre = input.nombre ? String(input.nombre).trim() : undefined;
  const nombreNormalizado = nombre ? nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ") : undefined;

  const { rows } = await client.query(
    `UPDATE productos
     SET codigo = COALESCE($1, codigo),
         sku = COALESCE($2, sku),
         codigo_barras = COALESCE($3, codigo_barras),
         nombre = COALESCE($4, nombre),
         nombre_normalizado = COALESCE($5, nombre_normalizado),
         categoria = COALESCE($6, categoria),
         precio_compra = COALESCE($7, precio_compra),
         precio_venta = COALESCE($8, precio_venta),
         stock = COALESCE($9, stock),
         stock_minimo = COALESCE($10, stock_minimo),
         activo = COALESCE($11, activo),
         updated_at = NOW()
     WHERE id = $12 AND tenant_id = $13
     RETURNING *`,
    [input.sku || null, input.sku || null, input.codigo_barras || null, nombre || null,
     nombreNormalizado || null, input.categoria || null, input.costo, input.precio,
     input.cantidad_stock, input.stock_minimo, input.activo, id, tenantId]
  );
  const after = rows[0] || null;
  if (usuarioId && after) {
    logProductChanges({ usuarioId, productId: id, accion: "actualizar", before, after, detalle: "Modificacion manual" });
  }
  return mapProductRow(after);
}

async function deleteProductPostgres(client, tenantId, id, usuarioId) {
  const { rows: product } = await client.query(
    'SELECT id, en_papelera FROM productos WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  if (!product[0]) {
    const error = new Error("Producto no encontrado");
    error.statusCode = 404;
    throw error;
  }
  if (product[0].en_papelera) {
    const error = new Error("Este producto ya esta en la papelera");
    error.statusCode = 400;
    throw error;
  }
  const { rows } = await client.query(
    `UPDATE productos SET en_papelera = TRUE, fecha_eliminacion = NOW(), eliminado_por = $3, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND en_papelera = FALSE
     RETURNING id`,
    [id, tenantId, usuarioId || null]
  );
  if (!rows[0]) {
    const error = new Error("Producto no encontrado");
    error.statusCode = 404;
    throw error;
  }
  if (usuarioId) {
    await client.query(
      `INSERT INTO audit_log (tenant_id, user_id, entidad, entidad_id, accion, detalle) VALUES ($1,$2,'producto',$3,'papelera',$4)`,
      [tenantId, usuarioId, id, JSON.stringify('Movido a papelera')]
    );
  }
  return { deleted: false, trash: true, message: "Producto movido a la papelera." };
}

async function listTrashProductsPostgres(client, tenantId) {
  const { rows } = await client.query(
    `SELECT p.*, u.username AS eliminado_por_usuario
     FROM productos p LEFT JOIN users u ON u.id = p.eliminado_por
     WHERE p.tenant_id = $1 AND p.en_papelera = TRUE ORDER BY p.fecha_eliminacion DESC`,
    [tenantId]
  );
  return rows.map(mapProductRow);
}

async function restoreProductPostgres(client, tenantId, id, usuarioId) {
  const { rows } = await client.query(
    `UPDATE productos SET en_papelera = FALSE, fecha_eliminacion = NULL, eliminado_por = NULL, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND en_papelera = TRUE
     RETURNING *`,
    [id, tenantId]
  );
  if (!rows[0]) {
    const error = new Error("Producto no encontrado en la papelera");
    error.statusCode = 404;
    throw error;
  }
  if (usuarioId) {
    await client.query(
      `INSERT INTO audit_log (tenant_id, user_id, entidad, entidad_id, accion, detalle) VALUES ($1,$2,'producto',$3,'restaurar',$4)`,
      [tenantId, usuarioId, id, JSON.stringify('Restaurado desde la papelera')]
    );
  }
  return { restored: true, product: mapProductRow(rows[0]) };
}

async function purgeOldTrashPostgres(client, tenantId, days) {
  const { rows: old } = await client.query(
    `SELECT id FROM productos WHERE tenant_id = $1 AND en_papelera = TRUE
     AND fecha_eliminacion IS NOT NULL AND fecha_eliminacion <= NOW() - ($2 || ' days')::INTERVAL`,
    [tenantId, days]
  );
  const ids = old.map(r => r.id);
  if (ids.length > 0) {
    await client.query(
      `DELETE FROM transactions WHERE tenant_id = $1 AND referencia_id = ANY($2::uuid[]) AND referencia_tipo = 'producto'`,
      [tenantId, ids]
    );
    await client.query(
      `DELETE FROM ventas_detalle WHERE tenant_id = $1 AND producto_id = ANY($2::uuid[])`,
      [tenantId, ids]
    );
    await client.query(
      `DELETE FROM audit_log WHERE tenant_id = $1 AND entidad = 'producto' AND entidad_id = ANY($2::uuid[])`,
      [tenantId, ids]
    );
    await client.query(
      `DELETE FROM productos WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [ids, tenantId]
    );
  }
  return { purged: ids.length };
}

// ── Exported functions (dual-mode) ────────────────────────────────

export function listProducts({ search = "", client, tenantId } = {}) {
  if (client) return listProductsPostgres(client, tenantId, search);
  const term = `%${search}%`;
  return getDb()
    .prepare(`
      SELECT id, nombre, sku, codigo_barras, categoria, cantidad_stock, stock_minimo, precio, costo, activo, imagen_url, thumbnail_url
      FROM productos
      WHERE activo = 1 AND en_papelera = 0 AND (? = '%%' OR nombre LIKE ? OR sku LIKE ? OR codigo_barras LIKE ? OR categoria LIKE ?)
      ORDER BY COALESCE(categoria, 'General') ASC, nombre ASC
    `)
    .all(term, term, term, term, term);
}

export function createProduct(input, { client, tenantId } = {}) {
  if (client) return createProductPostgres(client, tenantId, input);
  const payload = normalizeProductInput(input);
  const result = getDb()
    .prepare(`
      INSERT INTO productos (nombre, nombre_normalizado, sku, codigo_barras, categoria, cantidad_stock, stock_minimo, precio, costo, imagen_url)
      VALUES (@nombre, @nombre_normalizado, @sku, @codigo_barras, @categoria, @cantidad_stock, @stock_minimo, @precio, @costo, @imagen_url)
    `)
    .run(payload);
  return getDb().prepare("SELECT * FROM productos WHERE id = ?").get(result.lastInsertRowid);
}

export function updateProduct(id, input, usuarioId, { client, tenantId } = {}) {
  if (client) return updateProductPostgres(client, tenantId, id, input, usuarioId);
  const db = getDb();
  const existing = db.prepare("SELECT * FROM productos WHERE id = ? AND activo = 1").get(id);
  if (!existing) {
    const error = new Error("Producto no encontrado");
    error.statusCode = 404;
    throw error;
  }
  const payload = normalizeProductInput({ ...existing, ...input });
  db.prepare(`
    UPDATE productos
    SET nombre = @nombre, nombre_normalizado = @nombre_normalizado, sku = @sku,
        codigo_barras = @codigo_barras, categoria = @categoria, cantidad_stock = @cantidad_stock,
        stock_minimo = @stock_minimo, precio = @precio, costo = @costo,
        imagen_url = @imagen_url, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ ...payload, id });
  const updated = db.prepare("SELECT * FROM productos WHERE id = ?").get(id);
  if (usuarioId) {
    logProductChanges({ usuarioId, productId: id, accion: "actualizar", before: existing, after: updated, detalle: "Modificacion manual" });
  }
  return updated;
}

export function deleteProduct(id, usuarioId, { client, tenantId } = {}) {
  if (client) return deleteProductPostgres(client, tenantId, id, usuarioId);
  const db = getDb();
  const product = db.prepare("SELECT * FROM productos WHERE id = ?").get(id);
  if (!product) {
    const error = new Error("Producto no encontrado");
    error.statusCode = 404;
    throw error;
  }
  if (product.en_papelera) {
    const error = new Error("Este producto ya esta en la papelera");
    error.statusCode = 400;
    throw error;
  }
  db.prepare(`
    UPDATE productos SET en_papelera = 1, fecha_eliminacion = CURRENT_TIMESTAMP, eliminado_por = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(usuarioId || null, id);
  if (usuarioId) {
    logAudit({ usuarioId, entidad: "producto", entidadId: id, accion: "papelera", detalle: "Movido a papelera" });
  }
  return { deleted: false, trash: true, message: "Producto movido a la papelera." };
}

export function listTrashProducts({ client, tenantId } = {}) {
  if (client) return listTrashProductsPostgres(client, tenantId);
  return getDb().prepare(`
    SELECT p.*, u.usuario AS eliminado_por_usuario
    FROM productos p LEFT JOIN usuarios u ON u.id = p.eliminado_por
    WHERE p.en_papelera = 1 ORDER BY p.fecha_eliminacion DESC
  `).all();
}

export function restoreProduct(id, usuarioId, { client, tenantId } = {}) {
  if (client) return restoreProductPostgres(client, tenantId, id, usuarioId);
  const db = getDb();
  const product = db.prepare("SELECT * FROM productos WHERE id = ? AND en_papelera = 1").get(id);
  if (!product) {
    const error = new Error("Producto no encontrado en la papelera");
    error.statusCode = 404;
    throw error;
  }
  db.prepare(`
    UPDATE productos SET en_papelera = 0, fecha_eliminacion = NULL, eliminado_por = NULL, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
  if (usuarioId) {
    logAudit({ usuarioId, entidad: "producto", entidadId: id, accion: "restaurar", detalle: "Restaurado desde la papelera" });
  }
  return { restored: true, product: db.prepare("SELECT * FROM productos WHERE id = ?").get(id) };
}

export function purgeOldTrash(days = 7, { client, tenantId } = {}) {
  if (client) return purgeOldTrashPostgres(client, tenantId, days);
  const db = getDb();
  const old = db.prepare(`
    SELECT id, nombre FROM productos
    WHERE en_papelera = 1 AND fecha_eliminacion IS NOT NULL
    AND julianday('now') - julianday(fecha_eliminacion) >= ?
  `).all(days);
  const count = old.length;
  if (count > 0) {
    const ids = old.map(p => p.id);
    db.prepare(`DELETE FROM movimientos WHERE producto_id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    db.prepare(`DELETE FROM ventas WHERE producto_id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    db.prepare(`DELETE FROM bitacora_importaciones WHERE producto_id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    db.prepare(`DELETE FROM productos WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  }
  return { purged: count };
}



export function updateStock({ productoId, tipo, cantidad, usuarioId, nota, client, tenantId } = {}) {
  if (client) return updateStockPostgres(client, tenantId, productoId, tipo, cantidad, usuarioId, nota);
  const db = getDb();
  const product = db.prepare("SELECT * FROM productos WHERE id = ? AND activo = 1").get(productoId);
  if (!product) {
    const error = new Error("Producto no encontrado");
    error.statusCode = 404;
    throw error;
  }
  const nextStock = tipo === "entrada" ? product.cantidad_stock + cantidad : product.cantidad_stock - cantidad;
  if (nextStock < 0) {
    const error = new Error("Stock insuficiente");
    error.statusCode = 409;
    throw error;
  }
  try {
    db.exec("BEGIN");
    db.prepare("UPDATE productos SET cantidad_stock = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?").run(nextStock, productoId);
    db.prepare("INSERT INTO movimientos (producto_id, tipo, cantidad, usuario_id, nota) VALUES (?, ?, ?, ?, ?)")
      .run(productoId, tipo, cantidad, usuarioId, nota || null);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return db.prepare("SELECT * FROM productos WHERE id = ?").get(productoId);
}

async function updateStockPostgres(client, tenantId, productoId, tipo, cantidad, usuarioId, nota) {
  const { rows: product } = await client.query(
    'SELECT * FROM productos WHERE id = $1 AND tenant_id = $2 AND activo = TRUE',
    [productoId, tenantId]
  );
  if (!product[0]) {
    const error = new Error("Producto no encontrado");
    error.statusCode = 404;
    throw error;
  }
  const currentStock = Number(product[0].stock);
  const delta = tipo === "entrada" ? cantidad : -cantidad;
  if (currentStock + delta < 0) {
    const error = new Error("Stock insuficiente");
    error.statusCode = 409;
    throw error;
  }
  await client.query('BEGIN');
  try {
    await client.query(
      `UPDATE productos SET stock = stock + $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [delta, productoId, tenantId]
    );
    await client.query(
      `INSERT INTO transactions (tenant_id, tipo, referencia_id, referencia_tipo, monto, descripcion, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, tipo, productoId, 'producto', cantidad, nota || null, usuarioId || null]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  const { rows } = await client.query(
    'SELECT * FROM productos WHERE id = $1 AND tenant_id = $2',
    [productoId, tenantId]
  );
  return mapProductRow(rows[0]);
}

export function normalizeProductName(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function normalizeProductInput(input) {
  return {
    nombre: String(input.nombre || "").trim(),
    nombre_normalizado: normalizeProductName(input.nombre),
    sku: cleanOptional(input.sku),
    codigo_barras: cleanOptional(input.codigo_barras),
    categoria: cleanOptional(input.categoria),
    cantidad_stock: Number(input.cantidad_stock || 0),
    stock_minimo: Number(input.stock_minimo || 0),
    precio: Number(input.precio || 0),
    costo: Number(input.costo ?? 0),
    imagen_url: cleanOptional(input.imagen_url)
  };
}

function cleanOptional(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}


