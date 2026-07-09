import { getDb } from "../db/connection.js";

// ── Postgres helpers ──────────────────────────────────────────────

async function getStockReportPostgres(client, tenantId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::INTEGER AS total_productos,
            COALESCE(SUM(stock), 0) AS stock_total,
            COUNT(*) FILTER (WHERE stock <= stock_minimo AND activo = TRUE)::INTEGER AS productos_bajos
     FROM productos WHERE tenant_id = $1 AND activo = TRUE`,
    [tenantId]
  );
  return rows[0];
}

async function getProfitReportPostgres(client, tenantId, periodo) {
  const days = periodo === "dia" ? 1 : periodo === "semana" ? 7 : 30;
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(vd.subtotal - (vd.cantidad * p.precio_compra)), 0) AS ganancia_total
     FROM ventas_detalle vd
     JOIN productos p ON p.id = vd.producto_id
     JOIN ventas v ON v.id = vd.venta_id
     WHERE vd.tenant_id = $1 AND v.created_at >= NOW() - ($2 || ' days')::INTERVAL AND v.estatus = 'completada'`,
    [tenantId, days]
  );
  return rows[0];
}

async function getProfitEvolutionPostgres(client, tenantId) {
  const { rows } = await client.query(
    `SELECT DATE(v.created_at) AS dia, COALESCE(SUM(vd.subtotal - (vd.cantidad * p.precio_compra)), 0) AS ganancia
     FROM ventas_detalle vd
     JOIN productos p ON p.id = vd.producto_id
     JOIN ventas v ON v.id = vd.venta_id
     WHERE vd.tenant_id = $1 AND v.created_at >= NOW() - INTERVAL '30 days' AND v.estatus = 'completada'
     GROUP BY DATE(v.created_at) ORDER BY dia`,
    [tenantId]
  );
  return rows;
}

// ── Exported functions (dual-mode) ────────────────────────────────

export function getStockReport({ client, tenantId } = {}) {
  if (client) return getStockReportPostgres(client, tenantId);
  const db = getDb();
  return {
    total_productos: db.prepare("SELECT COUNT(*) AS c FROM productos WHERE activo = 1 AND en_papelera = 0").get().c,
    stock_total: db.prepare("SELECT COALESCE(SUM(cantidad_stock), 0) AS s FROM productos WHERE activo = 1 AND en_papelera = 0").get().s,
    productos_bajos: db.prepare("SELECT COUNT(*) AS c FROM productos WHERE activo = 1 AND en_papelera = 0 AND cantidad_stock <= stock_minimo").get().c,
  };
}

export function getProfitReport(periodo = "mes", { client, tenantId } = {}) {
  if (client) return getProfitReportPostgres(client, tenantId, periodo);
  const rango = periodo === "dia" ? 1 : periodo === "semana" ? 7 : 30;
  const { rows } = getDb().prepare(`
    SELECT COALESCE(SUM((v.precio_unitario - p.costo) * v.cantidad), 0) AS ganancia_total
    FROM ventas v JOIN productos p ON p.id = v.producto_id
    WHERE v.anulada = 0 AND julianday('now') - julianday(v.fecha) <= ?
  `).all(rango);
  return rows[0] || { ganancia_total: 0 };
}

export function getProfitEvolution({ client, tenantId } = {}) {
  if (client) return getProfitEvolutionPostgres(client, tenantId);
  return getDb().prepare(`
    SELECT DATE(v.fecha) AS dia, SUM((v.precio_unitario - p.costo) * v.cantidad) AS ganancia
    FROM ventas v JOIN productos p ON p.id = v.producto_id
    WHERE v.anulada = 0 AND julianday('now') - julianday(v.fecha) <= 30
    GROUP BY DATE(v.fecha) ORDER BY dia
  `).all();
}
