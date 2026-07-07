import { getDb } from "../db/connection.js";

export function getProfitEvolution() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT date(v.fecha) AS dia,
      COALESCE(SUM((p.precio - p.costo) * v.cantidad), 0) AS ganancia,
      COALESCE(SUM(v.total), 0) AS ingresos
    FROM ventas v
    JOIN productos p ON p.id = v.producto_id
    WHERE v.anulada = 0 AND date(v.fecha) >= date('now', '-30 days', 'localtime')
    GROUP BY date(v.fecha)
    ORDER BY dia ASC
  `).all();
  const map = {};
  for (const r of rows) map[r.dia] = r;
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const existing = map[key];
    days.push({
      dia: key,
      ganancia: existing ? existing.ganancia : 0,
      ingresos: existing ? existing.ingresos : 0
    });
  }
  return days;
}

export function getProfitReport(periodo) {
  const db = getDb();
  let periodFilter;
  if (periodo === "dia") {
    periodFilter = "date(v.fecha) = date('now', 'localtime')";
  } else if (periodo === "semana") {
    periodFilter = "strftime('%W', v.fecha) = strftime('%W', 'now', 'localtime') AND strftime('%Y', v.fecha) = strftime('%Y', 'now', 'localtime')";
  } else {
    periodFilter = "strftime('%Y-%m', v.fecha) = strftime('%Y-%m', 'now', 'localtime')";
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
    GROUP BY p.id
    ORDER BY ganancia_total DESC
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

export function getStockReport() {
  const db = getDb();
  return {
    agotados: db.prepare("SELECT * FROM productos WHERE activo = 1 AND en_papelera = 0 AND cantidad_stock = 0 ORDER BY nombre").all(),
    bajoStock: db.prepare("SELECT * FROM productos WHERE activo = 1 AND en_papelera = 0 AND cantidad_stock <= stock_minimo AND cantidad_stock > 0 ORDER BY cantidad_stock ASC").all(),
    ventasDia: salesPeriod("date(v.fecha) = date('now', 'localtime')"),
    ventasSemana: salesPeriod("strftime('%W', v.fecha) = strftime('%W', 'now', 'localtime') AND strftime('%Y', v.fecha) = strftime('%Y', 'now', 'localtime')"),
    ventasMes: salesPeriod("strftime('%Y-%m', v.fecha) = strftime('%Y-%m', 'now', 'localtime')"),
    ventasDiaDetalle: db.prepare(`
      SELECT p.id, p.nombre, SUM(v.cantidad) AS cantidad, SUM(v.total) AS total
      FROM ventas v
      JOIN productos p ON p.id = v.producto_id
      WHERE v.anulada = 0 AND date(v.fecha) = date('now', 'localtime')
      GROUP BY p.id
      ORDER BY cantidad DESC
    `).all(),
    menosVendidosSemana: db.prepare(`
      SELECT p.id, p.nombre, p.cantidad_stock, COALESCE(SUM(v.cantidad), 0) AS vendidos
      FROM productos p
      LEFT JOIN ventas v ON v.producto_id = p.id AND v.anulada = 0
        AND strftime('%W', v.fecha) = strftime('%W', 'now', 'localtime')
        AND strftime('%Y', v.fecha) = strftime('%Y', 'now', 'localtime')
      WHERE p.activo = 1 AND p.en_papelera = 0 AND p.cantidad_stock > 0
      GROUP BY p.id
      ORDER BY vendidos ASC, p.nombre ASC
      LIMIT 10
    `).all(),
    menosVendidosMes: db.prepare(`
      SELECT p.id, p.nombre, p.cantidad_stock, COALESCE(SUM(v.cantidad), 0) AS vendidos
      FROM productos p
      LEFT JOIN ventas v ON v.producto_id = p.id AND v.anulada = 0
        AND strftime('%Y-%m', v.fecha) = strftime('%Y-%m', 'now', 'localtime')
      WHERE p.activo = 1 AND p.en_papelera = 0 AND p.cantidad_stock > 0
      GROUP BY p.id
      ORDER BY vendidos ASC, p.nombre ASC
      LIMIT 10
    `).all()
  };

  function salesPeriod(whereClause) {
    const top = db.prepare(`
      SELECT p.id, p.nombre, SUM(v.cantidad) AS cantidad, SUM(v.total) AS total
      FROM ventas v
      JOIN productos p ON p.id = v.producto_id
      WHERE v.anulada = 0 AND ${whereClause}
      GROUP BY p.id
      ORDER BY cantidad DESC
      LIMIT 3
    `).all();

    const stats = db.prepare(`
      SELECT COALESCE(SUM(total), 0) AS ingresos
      FROM ventas v
      WHERE v.anulada = 0 AND ${whereClause}
    `).get();

    return { top, ingresos: stats.ingresos };
  }
}
