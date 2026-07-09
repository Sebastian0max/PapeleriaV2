import XLSX from "xlsx";
import { getDb } from "../db/connection.js";
import { normalizeProductName } from "./products-service.js";

const PREVIEW_CACHE = new Map();

/* ── Alias de encabezados ─────────────────────────────────────────── */
const HEADER_ALIASES = {
  codigo: [
    "codigo", "cod", "codigobarras", "codigo_barras", "codigo_de_barras",
    "barra", "barras", "barcode", "bar_code", "ean", "upc", "sku",
    "referencia", "ref", "id_producto", "id", "clave", "clave_producto",
    "numero", "num", "no", "no_producto", "codigo_producto"
  ],
  nombre: [
    "nombre", "producto", "productos", "descripcion", "descripcion_producto",
    "item", "articulo", "articulo_producto", "name", "product", "description",
    "product_name", "nombre_producto", "desc", "detalle", "detalles",
    "detalle_producto", "material", "nombre_articulo", "titulo",
    "nombre_del_producto", "nom_producto", "nom",
    "descripcion_articulo", "detalle_articulo", "articulo_nombre"
  ],
  cantidad: [
    "cantidad", "cant", "stock", "existencia", "existencias", "inventario",
    "cantidad_stock", "stock_actual", "unidades", "unidad", "qty", "quantity",
    "available", "on_hand", "piezas", "pzas", "pza", "und", "unds",
    "disponible", "en_stock", "total_stock", "cant", "stock_total",
    "stock_disponible", "existencia_actual", "numero_unidades", "num_unidades"
  ],
  precio: [
    "precio", "precio_venta", "valor", "valor_unitario", "pvp", "price",
    "sale_price", "unit_price", "costo", "precio_unitario", "pv",
    "precio_publico", "tarifa", "importe", "precio_de_venta",
    "precio_vta", "precio_venta_publico", "precio_lista",
    "precio_base", "precio_normal", "precio_regular", "precio_venta_final"
  ],
  categoria: [
    "categoria", "category", "familia", "linea", "grupo", "seccion",
    "tipo", "clasificacion", "departamento", "area", "rubro"
  ],
  stock_minimo: [
    "stock_minimo", "stock_min", "minimo", "min", "reorden",
    "punto_reorden", "minimum_stock", "reorder_point", "min_stock",
    "cantidad_minima", "cant_min"
  ]
};

// ── DB-agnostic parsing (unchanged) ────────────────────────────────

export async function parseImportFile(file) {
  if (!file) {
    const error = new Error("Archivo requerido");
    error.statusCode = 400;
    throw error;
  }
  const buffer = await file.toBuffer();
  const filename = file.filename || "importacion";
  const isCSV = /\.(csv|tsv|txt)$/i.test(filename);
  let rows;
  if (isCSV) {
    rows = parseCsvBuffer(buffer);
  } else {
    rows = parseWorkbook(buffer);
  }
  return { rows, filename };
}

export function buildImportPreview({ rows, filename, adminId, client, tenantId } = {}) {
  const nuevos = [];
  const actualizados = [];
  const errores = [];
  const seen = new Set();

  rows.forEach((raw, index) => {
    const rowNumber = raw.__rowNumber || index + 2;
    const sheetName = raw.__sheetName || null;
    const item = normalizeImportRow(raw);
    const rowErrors = validateImportRow(item);
    const key = item.codigo_barras || item.nombre_normalizado;
    if (key && seen.has(key)) rowErrors.push("Fila duplicada dentro del archivo");
    if (key) seen.add(key);
    if (rowErrors.length > 0) {
      errores.push({ rowNumber, sheetName, row: item, errores: rowErrors });
      return;
    }
    const existing = findExistingProduct(item, { client, tenantId });
    if (!existing) {
      nuevos.push({ rowNumber, sheetName, nuevo: item });
      return;
    }
    const changes = diffProduct(existing, item);
    if (changes.length > 0) {
      actualizados.push({
        rowNumber, sheetName,
        producto_id: existing.id,
        nombre: existing.nombre,
        disminuyeStock: item.cantidad_stock < existing.cantidad_stock,
        anterior: pickProductValues(existing),
        nuevo: item,
        cambios: changes
      });
    }
  });

  const unchanged = rows.length - nuevos.length - actualizados.length - errores.length;
  const noQuantityColumn = rows.length > 0 &&
    (rows[0].__rowNumber ? Object.keys(rows[0]).every(k => !HEADER_ALIASES.cantidad.includes(normalizeHeader(k))) : false);
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const preview = { token, filename, adminId, nuevos, actualizados, errores, unchanged, noQuantityColumn };
  PREVIEW_CACHE.set(token, preview);
  return preview;
}

export function applyImportPreview(token, adminId, { client, tenantId } = {}) {
  const preview = PREVIEW_CACHE.get(token);
  if (!preview || preview.adminId !== adminId) {
    const error = new Error("Vista previa expirada o invalida");
    error.statusCode = 400;
    throw error;
  }
  PREVIEW_CACHE.delete(token);

  if (client && tenantId) {
    return applyImportPostgres(client, tenantId, preview);
  }

  const db = getDb();
  let created = 0;
  let updated = 0;
  const errorCount = preview.errores.length;
  const tx = () => {
    db.exec("BEGIN");
    for (const entry of preview.nuevos) {
      const item = entry.nuevo;
      const result = db.prepare(`
        INSERT INTO productos (nombre, nombre_normalizado, sku, codigo_barras, categoria, cantidad_stock, stock_minimo, precio)
        VALUES (@nombre, @nombre_normalizado, @sku, @codigo_barras, @categoria, @cantidad_stock, @stock_minimo, @precio)
      `).run(toProductPayload(item));
      created += 1;
      logImport(db, { adminId, productoId: result.lastInsertRowid, tipo: "creado", anterior: null, nuevo: item, filename: preview.filename });
    }
    for (const entry of preview.actualizados) {
      const item = entry.nuevo;
      db.prepare(`
        UPDATE productos SET nombre = @nombre, nombre_normalizado = @nombre_normalizado,
          codigo_barras = COALESCE(@codigo_barras, codigo_barras), sku = COALESCE(@sku, sku),
          categoria = COALESCE(@categoria, categoria), cantidad_stock = COALESCE(@cantidad_stock, cantidad_stock),
          stock_minimo = COALESCE(@stock_minimo, stock_minimo), precio = COALESCE(@precio, precio),
          activo = 1, actualizado_en = CURRENT_TIMESTAMP
        WHERE id = @id
      `).run({ ...toProductPayloadUpdate(item), id: entry.producto_id });
      updated += 1;
      logImport(db, { adminId, productoId: entry.producto_id, tipo: "actualizado", anterior: entry.anterior, nuevo: item, filename: preview.filename });
    }
    db.exec("COMMIT");
  };
  try {
    tx();
    return { created, updated, unchanged: preview.unchanged, errors: errorCount };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listImportLogs({ fechaDesde, fechaHasta, usuarioId, producto, client, tenantId } = {}) {
  if (client && tenantId) return listImportLogsPostgres(client, tenantId, { fechaDesde, fechaHasta, usuarioId, producto });
  const filters = [];
  const params = [];
  if (fechaDesde) { filters.push("date(b.fecha_hora) >= date(?)"); params.push(fechaDesde); }
  if (fechaHasta) { filters.push("date(b.fecha_hora) <= date(?)"); params.push(fechaHasta); }
  if (usuarioId) { filters.push("b.usuario_admin_id = ?"); params.push(Number(usuarioId)); }
  if (producto) { filters.push("(p.nombre LIKE ? OR p.codigo_barras LIKE ? OR p.sku LIKE ?)"); params.push(`%${producto}%`, `%${producto}%`, `%${producto}%`); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  return getDb().prepare(`
    SELECT b.*, u.usuario AS usuario_admin, p.nombre AS producto_nombre
    FROM bitacora_importaciones b JOIN usuarios u ON u.id = b.usuario_admin_id JOIN productos p ON p.id = b.producto_id
    ${where} ORDER BY b.fecha_hora DESC LIMIT 200
  `).all(...params);
}

export function templateCsv() {
  return ["codigo,nombre,cantidad,precio,categoria,stock_minimo", "7790001,Cuaderno rayado,25,4500,Cuadernos,3"].join("\n");
}

// ── Postgres helpers ──────────────────────────────────────────────

async function findExistingProductPostgres(client, tenantId, item) {
  if (item.codigo_barras) {
    const { rows } = await client.query(
      'SELECT * FROM productos WHERE (codigo = $1 OR nombre = $2) AND tenant_id = $3 LIMIT 1',
      [item.codigo_barras, item.nombre, tenantId]
    );
    if (rows[0]) return rows[0];
  }
  const { rows } = await client.query(
    'SELECT * FROM productos WHERE nombre = $1 AND tenant_id = $2 LIMIT 1',
    [item.nombre, tenantId]
  );
  return rows[0] || null;
}

async function applyImportPostgres(client, tenantId, preview) {
  let created = 0;
  let updated = 0;
  for (const entry of preview.nuevos) {
    const item = entry.nuevo;
    await client.query(
      `INSERT INTO productos (tenant_id, codigo, nombre, precio_venta, stock, stock_minimo)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, item.codigo_barras || null, item.nombre, item.precio || 0, item.cantidad_stock || 0, item.stock_minimo || 0]
    );
    created++;
  }
  for (const entry of preview.actualizados) {
    const item = entry.nuevo;
    await client.query(
      `UPDATE productos SET nombre = $1, codigo = COALESCE($2, codigo), precio_venta = COALESCE($3, precio_venta),
       stock = COALESCE($4, stock), stock_minimo = COALESCE($5, stock_minimo), updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7`,
      [item.nombre, item.codigo_barras, item.precio, item.cantidad_stock, item.stock_minimo, entry.producto_id, tenantId]
    );
    updated++;
  }
  return { created, updated, unchanged: preview.unchanged, errors: preview.errores.length };
}

async function listImportLogsPostgres(client, tenantId, { fechaDesde, fechaHasta, usuarioId, producto }) {
  let sql = `SELECT * FROM audit_log WHERE tenant_id = $1 AND entidad = 'producto_import'`;
  const params = [tenantId];
  let idx = 2;
  if (fechaDesde) { sql += ` AND created_at >= $${idx++}`; params.push(fechaDesde); }
  if (fechaHasta) { sql += ` AND created_at <= $${idx++}`; params.push(fechaHasta); }
  if (usuarioId) { sql += ` AND user_id = $${idx++}`; params.push(usuarioId); }
  sql += ` ORDER BY created_at DESC LIMIT 200`;
  const { rows } = await client.query(sql, params);
  return rows;
}

// ── Helper functions (unchanged, no DB calls) ─────────────────────

function findExistingProduct(item, { client, tenantId } = {}) {
  if (client && tenantId) return findExistingProductPostgres(client, tenantId, item);
  const db = getDb();
  if (item.codigo_barras) {
    const byCode = db.prepare("SELECT * FROM productos WHERE codigo_barras = ? OR sku = ? LIMIT 1").get(item.codigo_barras, item.codigo_barras);
    if (byCode) return byCode;
  }
  return db.prepare("SELECT * FROM productos WHERE nombre_normalizado = ? LIMIT 1").get(item.nombre_normalizado);
}

function diffProduct(existing, item) {
  const changes = [];
  const fields = ["codigo_barras", "sku", "nombre", "categoria", "cantidad_stock", "stock_minimo", "precio"];
  for (const field of fields) {
    const next = item[field];
    if (next === undefined) continue;
    if ((field === "categoria" || field === "codigo_barras" || field === "sku") && !next) continue;
    if (String(existing[field] ?? "") !== String(next ?? "")) {
      changes.push({ campo: field, anterior: existing[field], nuevo: next });
    }
  }
  return changes;
}

function pickProductValues(product) {
  return {
    codigo_barras: product.codigo_barras, sku: product.sku, nombre: product.nombre,
    categoria: product.categoria, cantidad_stock: product.cantidad_stock,
    stock_minimo: product.stock_minimo, precio: product.precio
  };
}

function toProductPayload(item) {
  return {
    codigo_barras: item.codigo_barras ?? null, sku: item.sku ?? null, nombre: item.nombre,
    nombre_normalizado: item.nombre_normalizado, categoria: item.categoria !== undefined ? item.categoria : null,
    cantidad_stock: item.cantidad_stock !== undefined ? item.cantidad_stock : 0,
    stock_minimo: item.stock_minimo !== undefined ? item.stock_minimo : 0,
    precio: item.precio !== undefined && !Number.isNaN(item.precio) ? item.precio : 0
  };
}

function toProductPayloadUpdate(item) {
  return {
    codigo_barras: item.codigo_barras !== undefined ? item.codigo_barras : null,
    sku: item.sku !== undefined ? item.sku : null, nombre: item.nombre,
    nombre_normalizado: item.nombre_normalizado,
    categoria: item.categoria !== undefined ? item.categoria : null,
    cantidad_stock: item.cantidad_stock !== undefined ? item.cantidad_stock : null,
    stock_minimo: item.stock_minimo !== undefined ? item.stock_minimo : null,
    precio: item.precio !== undefined && !Number.isNaN(item.precio) ? item.precio : null
  };
}

function logImport(db, { adminId, productoId, tipo, anterior, nuevo, filename }) {
  db.prepare(`
    INSERT INTO bitacora_importaciones (usuario_admin_id, producto_id, tipo_cambio, valor_anterior, valor_nuevo, archivo_origen)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(adminId, productoId, tipo, anterior ? JSON.stringify(anterior) : null, JSON.stringify(nuevo), filename);
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  let text = String(value ?? "").trim();
  if (!text) return Number.NaN;
  text = text.replace(/\s+/g, "").replace(/^(cop|usd|eur|mxn|col|pesos|\$|€|£)/i, "").replace(/\s+/g, "");
  let cleaned = text.replace(/[^0-9,.\-]/g, "");
  if (!cleaned) {
    const extracted = String(value ?? "").match(/(\d+([.,]\d+)?)/);
    if (extracted) {
      const raw = extracted[1].replace(",", ".");
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return Number.NaN;
  }
  const commaCount = (cleaned.match(/,/g) || []).length;
  const dotCount = (cleaned.match(/\./g) || []).length;
  if (commaCount > 0 && dotCount > 0) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    cleaned = cleaned.split(thousands).join("").replace(decimal, ".");
  } else if (commaCount === 1 && dotCount === 0) {
    const after = cleaned.length - cleaned.lastIndexOf(",") - 1;
    if (after === 3) cleaned = cleaned.replace(/,/g, "");
    else cleaned = cleaned.replace(",", ".");
  } else if (dotCount === 1 && commaCount === 0) {
    const after = cleaned.length - cleaned.lastIndexOf(".") - 1;
    if (after === 3) cleaned = cleaned.replace(/\./g, "");
  } else if (commaCount > 1) { cleaned = cleaned.replace(/,/g, ""); }
  else if (dotCount > 1) { cleaned = cleaned.replace(/\./g, ""); }
  cleaned = cleaned.replace(",", ".");
  const result = Number(cleaned);
  return Number.isFinite(result) ? result : Number.NaN;
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
  const allRows = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: true });
    const sheetRows = rowsFromMatrix(matrix);
    for (const row of sheetRows) row.__sheetName = sheetName;
    allRows.push(...sheetRows);
  }
  return allRows;
}

function parseCsvBuffer(buffer) {
  let text = buffer.toString("utf-8");
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const delimiter = detectCsvDelimiter(text);
  const workbook = XLSX.read(text, { type: "string", raw: false, FS: delimiter });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: true });
  return rowsFromMatrix(matrix);
}

function detectCsvDelimiter(text) {
  const sampleLines = text.split(/\r?\n/).slice(0, 10).filter(Boolean);
  if (sampleLines.length === 0) return ",";
  const candidates = [",", ";", "\t"];
  let bestDelimiter = ",";
  let bestScore = 0;
  for (const sep of candidates) {
    const counts = sampleLines.map((line) => line.split(sep).length);
    const mostCommonCount = counts.sort((a, b) => counts.filter((v) => v === b).length - counts.filter((v) => v === a).length)[0];
    const consistent = counts.filter((c) => c === mostCommonCount).length;
    const score = consistent * (mostCommonCount - 1);
    if (score > bestScore) { bestScore = score; bestDelimiter = sep; }
  }
  return bestDelimiter;
}

function rowsFromMatrix(matrix) {
  const usefulRows = matrix.map((row, index) => ({ row: Array.isArray(row) ? row : [], rowNumber: index + 1 }))
    .filter(({ row }) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (usefulRows.length === 0) return [];
  const scored = usefulRows.slice(0, 50).map((item) => ({ ...item, score: scoreHeaderRow(item.row) }));
  const headerCandidate = scored.sort((a, b) => b.score - a.score)[0];
  if (headerCandidate && headerCandidate.score >= 2) {
    const mapping = buildHeaderMapping(headerCandidate.row);
    const hasCantidad = mapping.some(f => f === "cantidad");
    const results = [];
    for (const { row, rowNumber } of usefulRows) {
      if (rowNumber <= headerCandidate.rowNumber) continue;
      const obj = { __rowNumber: rowNumber };
      row.forEach((value, index) => {
        const field = mapping[index];
        if (field && obj[field] == null) obj[field] = value;
        if (!field && String(value ?? "").trim() !== "") obj[`__extra_${index}`] = value;
      });
      if (!hasCantidad && obj.cantidad == null) obj.cantidad = "0";
      if (hasImportSignal(obj)) results.push(obj);
    }
    return results;
  }
  const headerRow = usefulRows[0].row;
  const results = [];
  for (const { row, rowNumber } of usefulRows) {
    if (rowNumber <= usefulRows[0].rowNumber) continue;
    const obj = { __rowNumber: rowNumber, codigo: row[0], nombre: row[1], cantidad: row[2] != null ? row[2] : "0", precio: row[3], categoria: row[4], stock_minimo: row[5] };
    for (let i = 6; i < row.length; i++) { if (String(row[i] ?? "").trim() !== "") obj[`__extra_${i}`] = row[i]; }
    if (hasImportSignal(obj)) results.push(obj);
  }
  return results;
}

function scoreHeaderRow(row) {
  const recognized = new Set();
  for (const cell of row) { const field = canonicalField(normalizeHeader(cell)); if (field) recognized.add(field); }
  const hasCore = recognized.has("nombre") && (recognized.has("cantidad") || recognized.has("precio"));
  return recognized.size + (hasCore ? 3 : 0);
}

function buildHeaderMapping(row) { return row.map((cell) => canonicalField(normalizeHeader(cell))); }

function canonicalField(header) {
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) { if (aliases.includes(header)) return field; }
  return null;
}

function hasImportSignal(row) {
  const text = Object.entries(row).filter(([key]) => !key.startsWith("__")).map(([, value]) => String(value ?? "").trim()).filter(Boolean);
  if (text.length === 0) return false;
  const normalized = text.join(" ").toLowerCase();
  if (/^(total|subtotal|observaci[oó]n|nota|fecha|inventario|reporte)\b/.test(normalized)) return false;
  return true;
}

function normalizeImportRow(row) {
  const pick = (...keys) => {
    const entries = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]);
    for (const key of keys) {
      const found = entries.find(([header]) => header === key);
      if (found && String(found[1] ?? "").trim() !== "") return { present: true, value: found[1] };
    }
    for (const key of keys) { const found = entries.find(([header]) => header === key); if (found) return { present: true, value: "" }; }
    return { present: false, value: "" };
  };
  const nombreObj = pick("nombre", ...HEADER_ALIASES.nombre);
  const codigoObj = pick("codigo", ...HEADER_ALIASES.codigo);
  const cantidadObj = pick("cantidad", ...HEADER_ALIASES.cantidad);
  const precioObj = pick("precio", ...HEADER_ALIASES.precio);
  const categoriaObj = pick("categoria", ...HEADER_ALIASES.categoria);
  const stockMinimoObj = pick("stock_minimo", ...HEADER_ALIASES.stock_minimo);
  const nombre = String(nombreObj.value).trim();
  const codigo = String(codigoObj.value).trim();
  const parseNumOrUndef = (obj) => {
    if (!obj.present) return undefined;
    const trimmed = String(obj.value).trim();
    if (trimmed === "" || trimmed === "-" || trimmed === "--" || trimmed === "n/a") return undefined;
    const n = parseNumber(obj.value);
    return Number.isNaN(n) ? undefined : n;
  };
  const precio = parseNumOrUndef(precioObj);
  const cantidad = parseNumOrUndef(cantidadObj);
  const stockMinimo = parseNumOrUndef(stockMinimoObj);
  return {
    codigo_barras: codigo || null, sku: codigo || null, nombre,
    nombre_normalizado: normalizeProductName(nombre),
    cantidad_stock: Number.isFinite(cantidad) ? Math.round(cantidad) : undefined,
    stock_minimo: Number.isFinite(stockMinimo) && stockMinimo >= 0 ? Math.round(stockMinimo) : undefined,
    precio: Number.isFinite(precio) ? Math.round(precio) : undefined,
    categoria: categoriaObj.present ? String(categoriaObj.value).trim() || null : undefined
  };
}

function validateImportRow(item) {
  const errors = [];
  if (!item.nombre) errors.push("Nombre vacio");
  if (item.cantidad_stock !== undefined) {
    if (!Number.isInteger(item.cantidad_stock)) errors.push("Cantidad invalida o vacia");
    else if (item.cantidad_stock < 0) errors.push("Cantidad negativa");
  }
  if (item.precio !== undefined) {
    if (!Number.isFinite(item.precio) || item.precio < 0) errors.push("Precio invalido o vacio");
  }
  return errors;
}
