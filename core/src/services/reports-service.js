import { getDb } from "../db/connection.js";

// ── Postgres helpers ──────────────────────────────────────────────

async function getStockReportPostgres(client, tenantId) {
  const [totals, ventasDiaTop, ingresos, ventasDiaDetalle, ventasSemanaTop, ventasMesTop, menosVendidosSemana, menosVendidosMes, agotados, bajoStock] = await Promise.all([
    client.query(
      `SELECT COUNT(*)::INTEGER AS total_productos,
              COALESCE(SUM(stock), 0) AS stock_total,
              COUNT(*) FILTER (WHERE stock <= stock_minimo AND activo = TRUE)::INTEGER AS productos_bajos
       FROM productos WHERE tenant_id = $1 AND activo = TRUE`,
      [tenantId]
    ),
    client.query(
      `SELECT p.id, p.nombre, SUM(vd.cantidad)::INTEGER AS cantidad, COALESCE(SUM(vd.subtotal), 0)::NUMERIC(14,2) AS ingresos
       FROM ventas_detalle vd JOIN ventas v ON v.id = vd.venta_id JOIN productos p ON p.id = vd.producto_id
       WHERE vd.tenant_id = $1 AND DATE(v.created_at) = CURRENT_DATE AND v.estatus = 'completada'
       GROUP BY p.id, p.nombre ORDER BY cantidad DESC LIMIT 5`,
      [tenantId]
    ),
    client.query(
      `SELECT COALESCE(SUM(vd.subtotal) FILTER (WHERE DATE(v.created_at) = CURRENT_DATE), 0)::NUMERIC(14,2) AS dia,
              COALESCE(SUM(vd.subtotal) FILTER (WHERE v.created_at >= DATE_TRUNC('week', NOW())), 0)::NUMERIC(14,2) AS semana,
              COALESCE(SUM(vd.subtotal) FILTER (WHERE v.created_at >= DATE_TRUNC('month', NOW())), 0)::NUMERIC(14,2) AS mes
       FROM ventas_detalle vd JOIN ventas v ON v.id = vd.venta_id
       WHERE vd.tenant_id = $1 AND v.estatus = 'completada'`,
      [tenantId]
    ),
    client.query(
      `SELECT p.id, p.nombre, SUM(vd.cantidad)::INTEGER AS cantidad
       FROM ventas_detalle vd JOIN ventas v ON v.id = vd.venta_id JOIN productos p ON p.id = vd.producto_id
       WHERE vd.tenant_id = $1 AND DATE(v.created_at) = CURRENT_DATE AND v.estatus = 'completada'
       GROUP BY p.id, p.nombre ORDER BY p.nombre`,
      [tenantId]
    ),
    client.query(
      `SELECT p.id, p.nombre, SUM(vd.cantidad)::INTEGER AS cantidad, COALESCE(SUM(vd.subtotal), 0)::NUMERIC(14,2) AS ingresos
       FROM ventas_detalle vd JOIN ventas v ON v.id = vd.venta_id JOIN productos p ON p.id = vd.producto_id
       WHERE vd.tenant_id = $1 AND v.created_at >= DATE_TRUNC('week', NOW()) AND v.estatus = 'completada'
       GROUP BY p.id, p.nombre ORDER BY cantidad DESC LIMIT 5`,
      [tenantId]
    ),
    client.query(
      `SELECT p.id, p.nombre, SUM(vd.cantidad)::INTEGER AS cantidad, COALESCE(SUM(vd.subtotal), 0)::NUMERIC(14,2) AS ingresos
       FROM ventas_detalle vd JOIN ventas v ON v.id = vd.venta_id JOIN productos p ON p.id = vd.producto_id
       WHERE vd.tenant_id = $1 AND v.created_at >= DATE_TRUNC('month', NOW()) AND v.estatus = 'completada'
       GROUP BY p.id, p.nombre ORDER BY cantidad DESC LIMIT 5`,
      [tenantId]
    ),
    client.query(
      `SELECT p.id, p.nombre,
              COALESCE(SUM(CASE WHEN v.estatus = 'completada' THEN vd.cantidad ELSE 0 END), 0)::INTEGER AS vendidos
       FROM productos p
       LEFT JOIN ventas_detalle vd ON vd.producto_id = p.id AND vd.tenant_id = p.tenant_id
       LEFT JOIN ventas v ON v.id = vd.venta_id AND v.tenant_id = p.tenant_id AND v.created_at >= DATE_TRUNC('week', NOW())
       WHERE p.tenant_id = $1 AND p.activo = TRUE AND p.stock > 0
       GROUP BY p.id, p.nombre ORDER BY vendidos ASC, p.nombre ASC LIMIT 5`,
      [tenantId]
    ),
    client.query(
      `SELECT p.id, p.nombre,
              COALESCE(SUM(CASE WHEN v.estatus = 'completada' THEN vd.cantidad ELSE 0 END), 0)::INTEGER AS vendidos
       FROM productos p
       LEFT JOIN ventas_detalle vd ON vd.producto_id = p.id AND vd.tenant_id = p.tenant_id
       LEFT JOIN ventas v ON v.id = vd.venta_id AND v.tenant_id = p.tenant_id AND v.created_at >= DATE_TRUNC('month', NOW())
       WHERE p.tenant_id = $1 AND p.activo = TRUE AND p.stock > 0
       GROUP BY p.id, p.nombre ORDER BY vendidos ASC, p.nombre ASC LIMIT 5`,
      [tenantId]
    ),
    client.query(
      `SELECT id, nombre, stock AS cantidad_stock FROM productos WHERE tenant_id = $1 AND activo = TRUE AND stock = 0 ORDER BY nombre`,
      [tenantId]
    ),
    client.query(
      `SELECT id, nombre, stock AS cantidad_stock FROM productos WHERE tenant_id = $1 AND activo = TRUE AND stock > 0 AND stock <= stock_minimo ORDER BY nombre`,
      [tenantId]
    ),
  ]);

  const inr = ingresos.rows[0] || {};
  return {
    ...totals.rows[0],
    ventasDia: { top: ventasDiaTop.rows, ingresos: Number(inr.dia) || 0 },
    ventasDiaDetalle: ventasDiaDetalle.rows,
    ventasSemana: { top: ventasSemanaTop.rows, ingresos: Number(inr.semana) || 0 },
    ventasMes: { top: ventasMesTop.rows, ingresos: Number(inr.mes) || 0 },
    menosVendidosSemana: menosVendidosSemana.rows,
    menosVendidosMes: menosVendidosMes.rows,
    agotados: agotados.rows,
    bajoStock: bajoStock.rows,
  };
}

async function getProfitReportPostgres(client, tenantId, periodo) {
  const days = periodo === "dia" ? 1 : periodo === "semana" ? 7 : 30;
  const interval = `${days} days`;

  const [summaryRes, productsRes] = await Promise.all([
    client.query(
      `SELECT COALESCE(SUM(vd.subtotal - (vd.cantidad * p.precio_compra)), 0)::NUMERIC(14,2) AS "totalGanancia",
              COALESCE(SUM(vd.subtotal), 0)::NUMERIC(14,2) AS "totalIngresos"
       FROM ventas_detalle vd
       JOIN productos p ON p.id = vd.producto_id
       JOIN ventas v ON v.id = vd.venta_id
       WHERE vd.tenant_id = $1 AND v.created_at >= NOW() - $2::INTERVAL AND v.estatus = 'completada'`,
      [tenantId, interval]
    ),
    client.query(
      `SELECT p.id, p.nombre,
              p.precio_compra::NUMERIC(12,2) AS costo,
              p.precio_venta::NUMERIC(12,2) AS precio,
              SUM(vd.cantidad)::NUMERIC(12,2) AS cantidad_vendida,
              COALESCE(SUM(vd.subtotal - (vd.cantidad * p.precio_compra)), 0)::NUMERIC(14,2) AS ganancia_total,
              COALESCE(SUM(vd.subtotal), 0)::NUMERIC(14,2) AS ingresos,
              CASE WHEN SUM(vd.subtotal) > 0
                THEN ROUND((SUM(vd.subtotal - (vd.cantidad * p.precio_compra)) * 100.0 / SUM(vd.subtotal))::NUMERIC, 1)
                ELSE 0 END AS margen
       FROM ventas_detalle vd
       JOIN productos p ON p.id = vd.producto_id
       JOIN ventas v ON v.id = vd.venta_id
       WHERE vd.tenant_id = $1 AND v.created_at >= NOW() - $2::INTERVAL AND v.estatus = 'completada'
       GROUP BY p.id, p.nombre, p.precio_compra, p.precio_venta
       ORDER BY ganancia_total DESC`,
      [tenantId, interval]
    )
  ]);

  const summary = summaryRes.rows[0] || {};
  const products = (productsRes.rows || []).map(r => ({
    ...r,
    ganancia_unitaria: Number(r.precio) - Number(r.costo),
  }));

  return {
    totalGanancia: Number(summary.totalGanancia) || 0,
    totalIngresos: Number(summary.totalIngresos) || 0,
    products,
  };
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
  const totals = {
    total_productos: db.prepare("SELECT COUNT(*) AS c FROM productos WHERE activo = 1 AND en_papelera = 0").get().c,
    stock_total: db.prepare("SELECT COALESCE(SUM(cantidad_stock), 0) AS s FROM productos WHERE activo = 1 AND en_papelera = 0").get().s,
    productos_bajos: db.prepare("SELECT COUNT(*) AS c FROM productos WHERE activo = 1 AND en_papelera = 0 AND cantidad_stock <= stock_minimo").get().c,
  };

  const ventasDiaTop = db.prepare(`
    SELECT p.id, p.nombre, SUM(v.cantidad) AS cantidad, COALESCE(SUM(v.total), 0) AS ingresos
    FROM ventas v JOIN productos p ON p.id = v.producto_id
    WHERE v.anulada = 0 AND DATE(v.fecha) = DATE('now')
    GROUP BY p.id, p.nombre ORDER BY cantidad DESC LIMIT 5
  `).all();
  const ventasDiaIngresos = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS ingresos FROM ventas WHERE anulada = 0 AND DATE(fecha) = DATE('now')
  `).get().ingresos || 0;
  const ventasDiaDetalle = db.prepare(`
    SELECT p.id, p.nombre, SUM(v.cantidad) AS cantidad
    FROM ventas v JOIN productos p ON p.id = v.producto_id
    WHERE v.anulada = 0 AND DATE(v.fecha) = DATE('now')
    GROUP BY p.id, p.nombre ORDER BY p.nombre
  `).all();
  const ventasSemanaTop = db.prepare(`
    SELECT p.id, p.nombre, SUM(v.cantidad) AS cantidad, COALESCE(SUM(v.total), 0) AS ingresos
    FROM ventas v JOIN productos p ON p.id = v.producto_id
    WHERE v.anulada = 0 AND v.fecha >= DATE('now', '-7 days')
    GROUP BY p.id, p.nombre ORDER BY cantidad DESC LIMIT 5
  `).all();
  const ventasSemanaIngresos = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS ingresos FROM ventas WHERE anulada = 0 AND fecha >= DATE('now', '-7 days')
  `).get().ingresos || 0;
  const ventasMesTop = db.prepare(`
    SELECT p.id, p.nombre, SUM(v.cantidad) AS cantidad, COALESCE(SUM(v.total), 0) AS ingresos
    FROM ventas v JOIN productos p ON p.id = v.producto_id
    WHERE v.anulada = 0 AND v.fecha >= DATE('now', 'start of month')
    GROUP BY p.id, p.nombre ORDER BY cantidad DESC LIMIT 5
  `).all();
  const ventasMesIngresos = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS ingresos FROM ventas WHERE anulada = 0 AND fecha >= DATE('now', 'start of month')
  `).get().ingresos || 0;
  const menosVendidosSemana = db.prepare(`
    SELECT p.id, p.nombre, COALESCE(SUM(CASE WHEN v.anulada = 0 THEN v.cantidad ELSE 0 END), 0) AS vendidos
    FROM productos p LEFT JOIN ventas v ON v.producto_id = p.id AND v.fecha >= DATE('now', '-7 days')
    WHERE p.activo = 1 AND p.en_papelera = 0 AND p.cantidad_stock > 0
    GROUP BY p.id, p.nombre ORDER BY vendidos ASC, p.nombre ASC LIMIT 5
  `).all();
  const menosVendidosMes = db.prepare(`
    SELECT p.id, p.nombre, COALESCE(SUM(CASE WHEN v.anulada = 0 THEN v.cantidad ELSE 0 END), 0) AS vendidos
    FROM productos p LEFT JOIN ventas v ON v.producto_id = p.id AND v.fecha >= DATE('now', 'start of month')
    WHERE p.activo = 1 AND p.en_papelera = 0 AND p.cantidad_stock > 0
    GROUP BY p.id, p.nombre ORDER BY vendidos ASC, p.nombre ASC LIMIT 5
  `).all();
  const agotados = db.prepare(`
    SELECT id, nombre, cantidad_stock FROM productos WHERE activo = 1 AND en_papelera = 0 AND cantidad_stock = 0 ORDER BY nombre
  `).all();
  const bajoStock = db.prepare(`
    SELECT id, nombre, cantidad_stock FROM productos WHERE activo = 1 AND en_papelera = 0 AND cantidad_stock > 0 AND cantidad_stock <= stock_minimo ORDER BY nombre
  `).all();

  return {
    ...totals,
    ventasDia: { top: ventasDiaTop, ingresos: ventasDiaIngresos },
    ventasDiaDetalle,
    ventasSemana: { top: ventasSemanaTop, ingresos: ventasSemanaIngresos },
    ventasMes: { top: ventasMesTop, ingresos: ventasMesIngresos },
    menosVendidosSemana,
    menosVendidosMes,
    agotados,
    bajoStock,
  };
}

export function getProfitReport(periodo = "mes", { client, tenantId } = {}) {
  if (client) return getProfitReportPostgres(client, tenantId, periodo);
  const db = getDb();
  const rango = periodo === "dia" ? 1 : periodo === "semana" ? 7 : 30;

  const summary = db.prepare(`
    SELECT COALESCE(SUM((v.precio_unitario - p.costo) * v.cantidad), 0) AS totalGanancia,
           COALESCE(SUM(v.total), 0) AS totalIngresos
    FROM ventas v JOIN productos p ON p.id = v.producto_id
    WHERE v.anulada = 0 AND julianday('now') - julianday(v.fecha) <= ?
  `).get(rango) || { totalGanancia: 0, totalIngresos: 0 };

  const products = db.prepare(`
    SELECT p.id, p.nombre, p.costo, p.precio,
           SUM(v.cantidad) AS cantidad_vendida,
           SUM((v.precio_unitario - p.costo) * v.cantidad) AS ganancia_total,
           SUM(v.total) AS ingresos,
           CASE WHEN SUM(v.total) > 0
             THEN ROUND(SUM((v.precio_unitario - p.costo) * v.cantidad) * 100.0 / SUM(v.total), 1)
             ELSE 0 END AS margen
    FROM ventas v JOIN productos p ON p.id = v.producto_id
    WHERE v.anulada = 0 AND julianday('now') - julianday(v.fecha) <= ?
    GROUP BY p.id, p.nombre, p.costo, p.precio
    ORDER BY ganancia_total DESC
  `).all(rango).map(r => ({
    ...r,
    ganancia_unitaria: (r.precio || 0) - (r.costo || 0),
  }));

  return {
    totalGanancia: summary.totalGanancia || 0,
    totalIngresos: summary.totalIngresos || 0,
    products,
  };
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
