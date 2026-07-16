import { getDb } from "../db/connection.js";

// ── Postgres helpers ──────────────────────────────────────────────

async function getStockReportPostgres(client, tenantId) {
  const { rows: [base] } = await client.query(
    `SELECT COUNT(*)::INTEGER AS total_productos,
            COALESCE(SUM(stock), 0) AS stock_total,
            COUNT(*) FILTER (WHERE stock <= stock_minimo AND activo = TRUE)::INTEGER AS productos_bajos
     FROM productos WHERE tenant_id = $1 AND activo = TRUE AND en_papelera = FALSE`,
    [tenantId]
  );

  async function periodSales(dateFilter) {
    const [topRows, ingresosRows] = await Promise.all([
      client.query(`
        SELECT p.id, p.nombre, SUM(vd.cantidad) AS cantidad, SUM(vd.subtotal) AS total
        FROM ventas_detalle vd
        JOIN ventas v ON v.id = vd.venta_id
        JOIN productos p ON p.id = vd.producto_id
        WHERE vd.tenant_id = $1 AND v.estatus != 'revertida' AND ${dateFilter}
        GROUP BY p.id
        ORDER BY cantidad DESC
        LIMIT 3
      `, [tenantId]),
      client.query(`
        SELECT COALESCE(SUM(v.total), 0) AS ingresos
        FROM ventas v
        WHERE v.tenant_id = $1 AND v.estatus != 'revertida' AND ${dateFilter}
      `, [tenantId])
    ]);
    return { top: topRows.rows, ingresos: Number(ingresosRows.rows[0].ingresos) };
  }

  const [
    { rows: agotados },
    { rows: bajoStock },
    ventasDia,
    ventasSemana,
    ventasMes,
    { rows: ventasDiaDetalle },
    { rows: menosVendidosSemana },
    { rows: menosVendidosMes }
  ] = await Promise.all([
    client.query(`
      SELECT id, nombre, stock AS cantidad_stock
      FROM productos
      WHERE tenant_id = $1 AND activo = TRUE AND en_papelera = FALSE AND stock = 0
      ORDER BY nombre
    `, [tenantId]),
    client.query(`
      SELECT id, nombre, stock AS cantidad_stock
      FROM productos
      WHERE tenant_id = $1 AND activo = TRUE AND en_papelera = FALSE AND stock <= stock_minimo AND stock > 0
      ORDER BY stock ASC
    `, [tenantId]),
    periodSales("v.created_at >= CURRENT_DATE AND v.created_at < CURRENT_DATE + INTERVAL '1 day'"),
    periodSales("v.created_at >= date_trunc('week', CURRENT_DATE) AND v.created_at < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'"),
    periodSales("v.created_at >= date_trunc('month', CURRENT_DATE) AND v.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'"),
    client.query(`
      SELECT p.id, p.nombre, SUM(vd.cantidad) AS cantidad, SUM(vd.subtotal) AS total
      FROM ventas_detalle vd
      JOIN ventas v ON v.id = vd.venta_id
      JOIN productos p ON p.id = vd.producto_id
      WHERE vd.tenant_id = $1 AND v.estatus != 'revertida'
        AND v.created_at >= CURRENT_DATE AND v.created_at < CURRENT_DATE + INTERVAL '1 day'
      GROUP BY p.id
      ORDER BY cantidad DESC
    `, [tenantId]),
    client.query(`
      SELECT p.id, p.nombre, p.stock AS cantidad_stock, COALESCE(SUM(vd.cantidad), 0) AS vendidos
      FROM productos p
      LEFT JOIN ventas_detalle vd ON vd.producto_id = p.id
      LEFT JOIN ventas v ON v.id = vd.venta_id AND v.estatus != 'revertida'
        AND v.created_at >= date_trunc('week', CURRENT_DATE)
        AND v.created_at < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
      WHERE p.tenant_id = $1 AND p.activo = TRUE AND p.en_papelera = FALSE AND p.stock > 0
      GROUP BY p.id
      ORDER BY vendidos ASC, p.nombre ASC
      LIMIT 10
    `, [tenantId]),
    client.query(`
      SELECT p.id, p.nombre, p.stock AS cantidad_stock, COALESCE(SUM(vd.cantidad), 0) AS vendidos
      FROM productos p
      LEFT JOIN ventas_detalle vd ON vd.producto_id = p.id
      LEFT JOIN ventas v ON v.id = vd.venta_id AND v.estatus != 'revertida'
        AND v.created_at >= date_trunc('month', CURRENT_DATE)
        AND v.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      WHERE p.tenant_id = $1 AND p.activo = TRUE AND p.en_papelera = FALSE AND p.stock > 0
      GROUP BY p.id
      ORDER BY vendidos ASC, p.nombre ASC
      LIMIT 10
    `, [tenantId])
  ]);

  return {
    ...base,
    agotados,
    bajoStock,
    ventasDia,
    ventasSemana,
    ventasMes,
    ventasDiaDetalle,
    menosVendidosSemana,
    menosVendidosMes
  };
}

async function getProfitReportPostgres(client, tenantId, periodo) {
  let periodFilter;
  if (periodo === "dia") {
    periodFilter = "v.created_at >= CURRENT_DATE AND v.created_at < CURRENT_DATE + INTERVAL '1 day'";
  } else if (periodo === "semana") {
    periodFilter = "v.created_at >= date_trunc('week', CURRENT_DATE) AND v.created_at < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'";
  } else {
    periodFilter = "v.created_at >= date_trunc('month', CURRENT_DATE) AND v.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'";
  }
  const [products, totals] = await Promise.all([
    client.query(`
      SELECT p.id, p.nombre, p.costo, p.precio,
        (p.precio - p.costo) AS ganancia_unitaria,
        CASE WHEN p.precio > 0 THEN ROUND(((p.precio - p.costo) * 100.0 / p.precio)::NUMERIC, 1) ELSE 0 END AS margen,
        COALESCE(SUM(vd.cantidad), 0) AS unidades_vendidas,
        COALESCE(SUM(vd.subtotal - (vd.cantidad * p.costo)), 0) AS ganancia_total
      FROM productos p
      LEFT JOIN ventas_detalle vd ON vd.producto_id = p.id
      LEFT JOIN ventas v ON v.id = vd.venta_id AND v.estatus != 'revertida' AND ${periodFilter}
      WHERE p.tenant_id = $1 AND p.activo = TRUE AND p.en_papelera = FALSE
      GROUP BY p.id ORDER BY ganancia_total DESC
    `, [tenantId]),
    client.query(`
      SELECT
        COALESCE(SUM(vd.subtotal - (vd.cantidad * p.costo)), 0) AS ganancia_total,
        COALESCE(SUM(v.total), 0) AS ingresos
      FROM productos p
      LEFT JOIN ventas_detalle vd ON vd.producto_id = p.id
      LEFT JOIN ventas v ON v.id = vd.venta_id AND v.estatus != 'revertida' AND ${periodFilter}
      WHERE p.tenant_id = $1 AND p.activo = TRUE AND p.en_papelera = FALSE
    `, [tenantId])
  ]);
  return { products: products.rows, totalGanancia: Number(totals.rows[0].ganancia_total), totalIngresos: Number(totals.rows[0].ingresos) };
}

async function getProfitEvolutionPostgres(client, tenantId) {
  const { rows } = await client.query(
    `SELECT DATE(v.created_at) AS dia,
            COALESCE(SUM(vd.subtotal - (vd.cantidad * p.costo)), 0) AS ganancia,
            COALESCE(SUM(v.total), 0) AS ingresos
     FROM ventas_detalle vd
     JOIN ventas v ON v.id = vd.venta_id
     JOIN productos p ON p.id = vd.producto_id
     WHERE vd.tenant_id = $1 AND v.created_at >= NOW() - INTERVAL '30 days' AND v.estatus != 'revertida'
     GROUP BY DATE(v.created_at) ORDER BY dia`,
    [tenantId]
  );
  return fillEvolutionDays(rows);
}

// ── Exported functions (dual-mode) ────────────────────────────────

export function getStockReport({ client, tenantId } = {}) {
  if (client) return getStockReportPostgres(client, tenantId);
  const db = getDb();

  function salesPeriod(whereClause) {
    const top = db.prepare(`
      SELECT p.id, p.nombre, SUM(v.cantidad) AS cantidad, SUM(v.total) AS total
      FROM ventas v JOIN productos p ON p.id = v.producto_id
      WHERE v.anulada = 0 AND ${whereClause}
      GROUP BY p.id ORDER BY cantidad DESC LIMIT 3
    `).all();
    const stats = db.prepare(`
      SELECT COALESCE(SUM(total), 0) AS ingresos FROM ventas v
      WHERE v.anulada = 0 AND ${whereClause}
    `).get();
    return { top, ingresos: stats.ingresos };
  }

  return {
    total_productos: db.prepare("SELECT COUNT(*) AS c FROM productos WHERE activo = 1 AND en_papelera = 0").get().c,
    stock_total: db.prepare("SELECT COALESCE(SUM(cantidad_stock), 0) AS s FROM productos WHERE activo = 1 AND en_papelera = 0").get().s,
    productos_bajos: db.prepare("SELECT COUNT(*) AS c FROM productos WHERE activo = 1 AND en_papelera = 0 AND cantidad_stock <= stock_minimo").get().c,
    agotados: db.prepare("SELECT * FROM productos WHERE activo = 1 AND en_papelera = 0 AND cantidad_stock = 0 ORDER BY nombre").all(),
    bajoStock: db.prepare("SELECT * FROM productos WHERE activo = 1 AND en_papelera = 0 AND cantidad_stock <= stock_minimo AND cantidad_stock > 0 ORDER BY cantidad_stock ASC").all(),
    ventasDia: salesPeriod("date(v.fecha, 'localtime') = date('now', 'localtime')"),
    ventasSemana: salesPeriod("strftime('%W', v.fecha, 'localtime') = strftime('%W', 'now', 'localtime') AND strftime('%Y', v.fecha, 'localtime') = strftime('%Y', 'now', 'localtime')"),
    ventasMes: salesPeriod("strftime('%Y-%m', v.fecha, 'localtime') = strftime('%Y-%m', 'now', 'localtime')"),
    ventasDiaDetalle: db.prepare(`
      SELECT p.id, p.nombre, SUM(v.cantidad) AS cantidad, SUM(v.total) AS total
      FROM ventas v JOIN productos p ON p.id = v.producto_id
      WHERE v.anulada = 0 AND date(v.fecha, 'localtime') = date('now', 'localtime')
      GROUP BY p.id ORDER BY cantidad DESC
    `).all(),
    menosVendidosSemana: db.prepare(`
      SELECT p.id, p.nombre, p.cantidad_stock, COALESCE(SUM(v.cantidad), 0) AS vendidos
      FROM productos p
      LEFT JOIN ventas v ON v.producto_id = p.id AND v.anulada = 0
        AND strftime('%W', v.fecha, 'localtime') = strftime('%W', 'now', 'localtime')
        AND strftime('%Y', v.fecha, 'localtime') = strftime('%Y', 'now', 'localtime')
      WHERE p.activo = 1 AND p.en_papelera = 0 AND p.cantidad_stock > 0
      GROUP BY p.id ORDER BY vendidos ASC, p.nombre ASC LIMIT 10
    `).all(),
    menosVendidosMes: db.prepare(`
      SELECT p.id, p.nombre, p.cantidad_stock, COALESCE(SUM(v.cantidad), 0) AS vendidos
      FROM productos p
      LEFT JOIN ventas v ON v.producto_id = p.id AND v.anulada = 0
        AND strftime('%Y-%m', v.fecha, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
      WHERE p.activo = 1 AND p.en_papelera = 0 AND p.cantidad_stock > 0
      GROUP BY p.id ORDER BY vendidos ASC, p.nombre ASC LIMIT 10
    `).all()
  };
}

export function getProfitReport(periodo = "mes", { client, tenantId } = {}) {
  if (client) return getProfitReportPostgres(client, tenantId, periodo);
  const db = getDb();
  let periodFilter;
  if (periodo === "dia") {
    periodFilter = "date(v.fecha, 'localtime') = date('now', 'localtime')";
  } else if (periodo === "semana") {
    periodFilter = "strftime('%W', v.fecha, 'localtime') = strftime('%W', 'now', 'localtime') AND strftime('%Y', v.fecha, 'localtime') = strftime('%Y', 'now', 'localtime')";
  } else {
    periodFilter = "strftime('%Y-%m', v.fecha, 'localtime') = strftime('%Y-%m', 'now', 'localtime')";
  }
  const products = db.prepare(`
    SELECT p.id, p.nombre, p.costo, p.precio,
      (p.precio - p.costo) AS ganancia_unitaria,
      CASE WHEN p.precio > 0 THEN ROUND(CAST((p.precio - p.costo) AS REAL) * 100.0 / p.precio, 1) ELSE 0 END AS margen,
      COALESCE(SUM(CASE WHEN v.anulada = 0 AND ${periodFilter} THEN v.cantidad ELSE 0 END), 0) AS unidades_vendidas,
      COALESCE(SUM(CASE WHEN v.anulada = 0 AND ${periodFilter} THEN (p.precio - p.costo) * v.cantidad ELSE 0 END), 0) AS ganancia_total
    FROM productos p
    LEFT JOIN ventas v ON v.producto_id = p.id
    WHERE p.activo = 1 AND p.en_papelera = 0
    GROUP BY p.id ORDER BY ganancia_total DESC
  `).all();
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN v.anulada = 0 AND ${periodFilter} THEN (p.precio - p.costo) * v.cantidad ELSE 0 END), 0) AS ganancia_total,
      COALESCE(SUM(CASE WHEN v.anulada = 0 AND ${periodFilter} THEN v.total ELSE 0 END), 0) AS ingresos
    FROM productos p
    LEFT JOIN ventas v ON v.producto_id = p.id
    WHERE p.activo = 1 AND p.en_papelera = 0
  `).get();
  return { products, totalGanancia: totals.ganancia_total, totalIngresos: totals.ingresos };
}

function fillEvolutionDays(rows) {
  const map = {};
  for (const r of rows) map[r.dia] = r;
  const days = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const existing = map[key];
    days.push({ dia: key, ganancia: existing ? existing.ganancia : 0, ingresos: existing ? existing.ingresos : 0 });
  }
  return days;
}

export function getProfitEvolution({ client, tenantId } = {}) {
  if (client) return getProfitEvolutionPostgres(client, tenantId);
  const rows = getDb().prepare(`
    SELECT DATE(v.fecha) AS dia,
      COALESCE(SUM(CASE WHEN v.anulada = 0 THEN (p.precio - p.costo) * v.cantidad ELSE 0 END), 0) AS ganancia,
      COALESCE(SUM(CASE WHEN v.anulada = 0 THEN v.total ELSE 0 END), 0) AS ingresos
    FROM ventas v JOIN productos p ON p.id = v.producto_id
    WHERE julianday('now') - julianday(v.fecha) <= 30
    GROUP BY DATE(v.fecha) ORDER BY dia
  `).all();
  return fillEvolutionDays(rows);
}
