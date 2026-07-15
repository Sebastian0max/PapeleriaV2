import { getDb } from "../db/connection.js";
import { config } from "../config.js";
import fs from "node:fs";
import { Jimp } from "jimp";
import path from "node:path";
import { logAudit, logProductChanges } from "./audit-service.js";
import { uploadImage, isCloudEnabled } from "./cloud-backup.js";

// ── Postgres helpers ──────────────────────────────────────────────

function mapProductRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    sku: row.codigo || null,
    codigo_barras: null,
    categoria: null,
    cantidad_stock: Number(row.stock),
    stock_minimo: Number(row.stock_minimo),
    precio: Number(row.precio_venta),
    costo: Number(row.precio_compra),
    activo: row.activo ? 1 : 0,
    imagen_url: null,
    thumbnail_url: null,
    en_papelera: row.activo ? 0 : 1,
    creado_en: row.created_at,
    actualizado_en: row.updated_at,
    fecha_eliminacion: null,
    eliminado_por: null,
  };
}

async function listProductsPostgres(client, tenantId, search) {
  const term = `%${search}%`;
  const { rows } = await client.query(
    `SELECT * FROM productos
     WHERE tenant_id = $1 AND activo = TRUE
       AND ($2 = '%%' OR nombre ILIKE $2 OR codigo ILIKE $2)
     ORDER BY nombre ASC`,
    [tenantId, term]
  );
  return rows.map(mapProductRow);
}

async function createProductPostgres(client, tenantId, input) {
  const nombre = String(input.nombre || "").trim();
  const { rows } = await client.query(
    `INSERT INTO productos (tenant_id, codigo, nombre, precio_compra, precio_venta, stock, stock_minimo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, input.sku || null, nombre, input.costo || 0, input.precio || 0, input.cantidad_stock || 0, input.stock_minimo || 0]
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

  const { rows } = await client.query(
    `UPDATE productos
     SET codigo = COALESCE($1, codigo),
         nombre = COALESCE($2, nombre),
         precio_compra = COALESCE($3, precio_compra),
         precio_venta = COALESCE($4, precio_venta),
         stock = COALESCE($5, stock),
         stock_minimo = COALESCE($6, stock_minimo),
         activo = COALESCE($7, activo),
         updated_at = NOW()
     WHERE id = $8 AND tenant_id = $9
     RETURNING *`,
    [input.sku, input.nombre, input.costo, input.precio, input.cantidad_stock, input.stock_minimo, input.activo, id, tenantId]
  );
  return mapProductRow(rows[0] || null);
}

async function deleteProductPostgres(client, tenantId, id, usuarioId) {
  const { rows } = await client.query(
    `UPDATE productos SET activo = FALSE, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND activo = TRUE
     RETURNING id`,
    [id, tenantId]
  );
  if (!rows[0]) {
    const error = new Error("Producto no encontrado");
    error.statusCode = 404;
    throw error;
  }
  return { deleted: false, trash: true, message: "Producto movido a la papelera." };
}

async function listTrashProductsPostgres(client, tenantId) {
  const { rows } = await client.query(
    `SELECT * FROM productos WHERE tenant_id = $1 AND activo = FALSE ORDER BY updated_at DESC`,
    [tenantId]
  );
  return rows.map(mapProductRow);
}

async function restoreProductPostgres(client, tenantId, id, usuarioId) {
  const { rows } = await client.query(
    `UPDATE productos SET activo = TRUE, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND activo = FALSE
     RETURNING *`,
    [id, tenantId]
  );
  if (!rows[0]) {
    const error = new Error("Producto no encontrado en la papelera");
    error.statusCode = 404;
    throw error;
  }
  return { restored: true, product: mapProductRow(rows[0]) };
}

async function purgeOldTrashPostgres(client, tenantId, days) {
  const { rowCount } = await client.query(
    `DELETE FROM productos WHERE tenant_id = $1 AND activo = FALSE
     AND updated_at <= NOW() - ($2 || ' days')::INTERVAL`,
    [tenantId, days]
  );
  return { purged: rowCount };
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

export async function updateProductImage(id, file, { client, tenantId } = {}) {
  if (!file) {
    const error = new Error("Imagen requerida");
    error.statusCode = 400;
    throw error;
  }
  const allowed = new Map([
    ["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]
  ]);
  if (!allowed.has(file.mimetype)) {
    const error = new Error("Formato de imagen invalido");
    error.statusCode = 400;
    throw error;
  }
  let product;
  if (client) {
    const { rows } = await client.query('SELECT * FROM productos WHERE id = $1 AND tenant_id = $2 AND activo = TRUE', [id, tenantId]);
    product = rows[0] || null;
  } else {
    product = getDb().prepare("SELECT * FROM productos WHERE id = ? AND activo = 1").get(id);
  }
  if (!product) {
    const error = new Error("Producto no encontrado");
    error.statusCode = 404;
    throw error;
  }
  const ext = allowed.get(file.mimetype);
  const bytes = await file.toBuffer();
  if (bytes.length > 2 * 1024 * 1024) {
    const error = new Error("La imagen no puede superar 2MB");
    error.statusCode = 413;
    throw error;
  }
  const name = `${id}-${Date.now()}${ext}`;
  const thumbName = `${id}-${Date.now()}-thumb.jpg`;
  let url, thumbUrl;
  if (isCloudEnabled()) {
    const cloudUrl = await uploadImage(name, bytes, file.mimetype);
    if (!cloudUrl) {
      const error = new Error("No se pudo subir la imagen a la nube");
      error.statusCode = 500;
      throw error;
    }
    url = cloudUrl;
    try {
      const image = await Jimp.read(bytes);
      image.cover({ w: 160, h: 160 });
      const thumbBuffer = await image.getBuffer("image/jpeg");
      const cloudThumbUrl = await uploadImage(thumbName, thumbBuffer, "image/jpeg");
      thumbUrl = cloudThumbUrl || cloudUrl;
    } catch {
      thumbUrl = cloudUrl;
    }
  } else {
    const dir = path.join(config.uploadsDir, "productos");
    fs.mkdirSync(dir, { recursive: true });
    const fullPath = path.join(dir, name);
    const thumbPath = path.join(dir, thumbName);
    fs.writeFileSync(fullPath, bytes);
    try {
      await createThumbnail(bytes, thumbPath);
    } catch {
      fs.rmSync(fullPath, { force: true });
      const error = new Error("La imagen no se pudo procesar");
      error.statusCode = 400;
      throw error;
    }
    url = `/uploads/productos/${name}`;
    thumbUrl = `/uploads/productos/${thumbName}`;
  }
  if (client) {
    await client.query(
      'UPDATE productos SET imagen_url = $1, thumbnail_url = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4',
      [url, thumbUrl, id, tenantId]
    );
    const { rows } = await client.query('SELECT * FROM productos WHERE id = $1', [id]);
    return mapProductRow(rows[0] || null);
  }
  getDb().prepare(`
    UPDATE productos SET imagen_url = ?, thumbnail_url = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?
  `).run(url, thumbUrl, id);
  return getDb().prepare("SELECT * FROM productos WHERE id = ?").get(id);
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
  const delta = tipo === "entrada" ? cantidad : -cantidad;
  await client.query(
    `UPDATE productos SET stock = stock + $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
    [delta, productoId, tenantId]
  );
  return mapProductRow(product[0]);
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

async function createThumbnail(bytes, thumbPath) {
  const image = await Jimp.read(bytes);
  image.cover({ w: 160, h: 160 });
  await image.write(thumbPath);
}
