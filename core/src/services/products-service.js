import { getDb } from "../db/connection.js";
import { config } from "../config.js";
import fs from "node:fs";
import { Jimp } from "jimp";
import path from "node:path";
import { logAudit, logProductChanges } from "./audit-service.js";
import { uploadImage, isCloudEnabled } from "./cloud-backup.js";

export function listProducts({ search = "" } = {}) {
  const term = `%${search}%`;
  return getDb()
    .prepare(`
      SELECT id, nombre, sku, codigo_barras, categoria, cantidad_stock, stock_minimo, precio, activo, imagen_url, thumbnail_url
      FROM productos
      WHERE activo = 1 AND (? = '%%' OR nombre LIKE ? OR sku LIKE ? OR codigo_barras LIKE ? OR categoria LIKE ?)
      ORDER BY COALESCE(categoria, 'General') ASC, nombre ASC
    `)
    .all(term, term, term, term, term);
}

export function createProduct(input) {
  const payload = normalizeProductInput(input);
  const result = getDb()
    .prepare(`
      INSERT INTO productos (nombre, nombre_normalizado, sku, codigo_barras, categoria, cantidad_stock, stock_minimo, precio, imagen_url)
      VALUES (@nombre, @nombre_normalizado, @sku, @codigo_barras, @categoria, @cantidad_stock, @stock_minimo, @precio, @imagen_url)
    `)
    .run(payload);

  return getDb().prepare("SELECT * FROM productos WHERE id = ?").get(result.lastInsertRowid);
}

export function updateProduct(id, input, usuarioId) {
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
    SET nombre = @nombre,
        nombre_normalizado = @nombre_normalizado,
        sku = @sku,
        codigo_barras = @codigo_barras,
        categoria = @categoria,
        cantidad_stock = @cantidad_stock,
        stock_minimo = @stock_minimo,
        precio = @precio,
        imagen_url = @imagen_url,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ ...payload, id });

  const updated = db.prepare("SELECT * FROM productos WHERE id = ?").get(id);
  if (usuarioId) {
    logProductChanges({
      usuarioId,
      productId: id,
      accion: "actualizar",
      before: existing,
      after: updated,
      detalle: "Modificacion manual"
    });
  }

  return updated;
}

export function deleteProduct(id, usuarioId) {
  const db = getDb();
  const product = db.prepare("SELECT * FROM productos WHERE id = ?").get(id);
  if (!product) {
    const error = new Error("Producto no encontrado");
    error.statusCode = 404;
    throw error;
  }

  const hasHistory = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM ventas WHERE producto_id = ?) +
      (SELECT COUNT(*) FROM movimientos WHERE producto_id = ?) +
      (SELECT COUNT(*) FROM bitacora_importaciones WHERE producto_id = ?) AS total
  `).get(id, id, id).total > 0;

  if (hasHistory) {
    db.prepare("UPDATE productos SET activo = 0, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    if (usuarioId) {
      logAudit({
        usuarioId,
        entidad: "producto",
        entidadId: id,
        accion: "desactivar",
        campo: "activo",
        valorAnterior: 1,
        valorNuevo: 0,
        detalle: "Baja logica por historial existente"
      });
    }
    return { deleted: false, deactivated: true };
  }

  db.prepare("DELETE FROM productos WHERE id = ?").run(id);
  if (usuarioId) {
    logAudit({
      usuarioId,
      entidad: "producto",
      entidadId: id,
      accion: "eliminar",
      detalle: "Eliminacion fisica (sin historial)"
    });
  }
  return { deleted: true, deactivated: false };
}

export async function updateProductImage(id, file) {
  if (!file) {
    const error = new Error("Imagen requerida");
    error.statusCode = 400;
    throw error;
  }

  const allowed = new Map([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"]
  ]);
  if (!allowed.has(file.mimetype)) {
    const error = new Error("Formato de imagen invalido");
    error.statusCode = 400;
    throw error;
  }

  const product = getDb().prepare("SELECT * FROM productos WHERE id = ? AND activo = 1").get(id);
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
    // Upload to Supabase Storage
    const cloudUrl = await uploadImage(name, bytes, file.mimetype);
    if (!cloudUrl) {
      const error = new Error("No se pudo subir la imagen a la nube");
      error.statusCode = 500;
      throw error;
    }
    url = cloudUrl;

    // Create and upload thumbnail
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
    // Local storage (development)
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

  getDb().prepare(`
    UPDATE productos SET imagen_url = ?, thumbnail_url = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?
  `).run(url, thumbUrl, id);

  return getDb().prepare("SELECT * FROM productos WHERE id = ?").get(id);
}

export function updateStock({ productoId, tipo, cantidad, usuarioId, nota }) {
  const db = getDb();
  const product = db.prepare("SELECT * FROM productos WHERE id = ? AND activo = 1").get(productoId);
  if (!product) {
    const error = new Error("Producto no encontrado");
    error.statusCode = 404;
    throw error;
  }

  const nextStock = tipo === "entrada"
    ? product.cantidad_stock + cantidad
    : product.cantidad_stock - cantidad;

  if (nextStock < 0) {
    const error = new Error("Stock insuficiente");
    error.statusCode = 409;
    throw error;
  }

  const tx = () => {
    db.exec("BEGIN");
    db.prepare("UPDATE productos SET cantidad_stock = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?")
      .run(nextStock, productoId);
    db.prepare(`
      INSERT INTO movimientos (producto_id, tipo, cantidad, usuario_id, nota)
      VALUES (?, ?, ?, ?, ?)
    `).run(productoId, tipo, cantidad, usuarioId, nota || null);
    db.exec("COMMIT");
  };

  try {
    tx();
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return db.prepare("SELECT * FROM productos WHERE id = ?").get(productoId);
}

export function normalizeProductName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
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
