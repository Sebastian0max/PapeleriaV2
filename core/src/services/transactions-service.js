import { getDb } from "../db/connection.js";

export function listTransactions({ limit = 50, offset = 0, fechaDesde, fechaHasta, producto }) {
  const db = getDb();
  const filters = [];
  const params = [];

  if (fechaDesde) {
    filters.push("date(m.fecha) >= date(?)");
    params.push(fechaDesde);
  }
  if (fechaHasta) {
    filters.push("date(m.fecha) <= date(?)");
    params.push(fechaHasta);
  }
  if (producto) {
    filters.push("(p.nombre LIKE ? OR p.codigo_barras LIKE ? OR p.sku LIKE ?)");
    params.push(`%${producto}%`, `%${producto}%`, `%${producto}%`);
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const data = db.prepare(`
    SELECT m.*, 
           p.nombre AS producto_nombre, 
           u.usuario AS usuario_nombre
    FROM movimientos m
    JOIN productos p ON m.producto_id = p.id
    JOIN usuarios u ON m.usuario_id = u.id
    ${where}
    ORDER BY m.fecha DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM movimientos m
    JOIN productos p ON m.producto_id = p.id
    ${where}
  `).get(...params).total;

  return { transactions: data, total, limit, offset };
}
