import { getDb } from "../db/connection.js";

export function getStockReport() {
  const db = getDb();
  return {
    agotados: db.prepare("SELECT * FROM productos WHERE activo = 1 AND cantidad_stock = 0 ORDER BY nombre").all(),
    bajoStock: db.prepare("SELECT * FROM productos WHERE activo = 1 AND cantidad_stock <= stock_minimo AND cantidad_stock > 0 ORDER BY cantidad_stock ASC").all(),
    ventasDia: salesPeriod("date(v.fecha) = date('now', 'localtime')"),
    ventasSemana: salesPeriod("strftime('%W', v.fecha) = strftime('%W', 'now', 'localtime') AND strftime('%Y', v.fecha) = strftime('%Y', 'now', 'localtime')"),
    ventasMes: salesPeriod("strftime('%Y-%m', v.fecha) = strftime('%Y-%m', 'now', 'localtime')"),
    menosVendidos: db.prepare(`
      SELECT p.id, p.nombre, p.cantidad_stock, COALESCE(SUM(v.cantidad), 0) AS vendidos
      FROM productos p
      LEFT JOIN ventas v ON v.producto_id = p.id AND v.anulada = 0
      WHERE p.activo = 1
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
