import * as XLSX from "xlsx";
import { getDb } from "../db/connection.js";
import { generateProductosPDF, generateVentasPDF } from "../services/pdf-service.js";

export async function exportRoutes(app) {
  app.get("/productos", { preHandler: [app.authenticate] }, async (request, reply) => {
    const productos = getDb().prepare(`
      SELECT p.id, p.nombre, p.cantidad_stock, p.precio, p.stock_minimo, p.codigo_barras, p.sku, p.categoria
      FROM productos p WHERE p.eliminado = 0 ORDER BY p.nombre
    `).all();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(productos.map(p => ({
      ID: p.id, Nombre: p.nombre, Stock: p.cantidad_stock, Precio: p.precio,
      "Stock Mínimo": p.stock_minimo, "Código Barras": p.codigo_barras,
      SKU: p.sku, Categoría: p.categoria
    })));
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", "attachment; filename=productos.xlsx").send(buf);
  });

  app.get("/ventas", { preHandler: [app.authenticate] }, async (request, reply) => {
    const ventas = getDb().prepare(`
      SELECT v.id, p.nombre AS producto, v.cantidad, v.precio_unitario, v.total, v.fecha, u.usuario AS vendedor
      FROM ventas v JOIN productos p ON p.id = v.producto_id LEFT JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.anulada = 0 ORDER BY v.fecha DESC
    `).all();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(ventas.map(v => ({
      ID: v.id, Producto: v.producto, Cantidad: v.cantidad,
      "Precio Unitario": v.precio_unitario, Total: v.total,
      Fecha: v.fecha, Vendedor: v.vendedor
    })));
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", "attachment; filename=ventas.xlsx").send(buf);
  });

  app.get("/reportes", { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDb();
    const hoy = new Date().toISOString().split("T")[0];
    const semana = new Date(Date.now() - 7 * 864e5).toISOString().split("T")[0];
    const mes = new Date(Date.now() - 30 * 864e5).toISOString().split("T")[0];
    const ventasHoy = db.prepare(`
      SELECT p.nombre, SUM(v.cantidad) AS cantidad, SUM(v.total) AS total
      FROM ventas v JOIN productos p ON p.id = v.producto_id
      WHERE v.anulada = 0 AND date(v.fecha) = ? GROUP BY p.id ORDER BY cantidad DESC
    `).all(hoy);
    const ventasSemana = db.prepare(`
      SELECT p.nombre, SUM(v.cantidad) AS cantidad, SUM(v.total) AS total
      FROM ventas v JOIN productos p ON p.id = v.producto_id
      WHERE v.anulada = 0 AND date(v.fecha) >= ? GROUP BY p.id ORDER BY cantidad DESC
    `).all(semana);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ventasHoy), "Hoy");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ventasSemana), "Semana");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", "attachment; filename=reportes.xlsx").send(buf);
  });

  app.get("/productos/pdf", { preHandler: [app.authenticate] }, async (request, reply) => {
    const productos = getDb().prepare(`
      SELECT p.id, p.nombre, p.cantidad_stock, p.precio, p.costo
      FROM productos p WHERE p.eliminado = 0 ORDER BY p.nombre
    `).all();
    const doc = generateProductosPDF(productos);
    const chunks = [];
    for await (const chunk of doc) chunks.push(chunk);
    return reply.type("application/pdf")
      .header("Content-Disposition", "attachment; filename=productos.pdf").send(Buffer.concat(chunks));
  });

  app.get("/ventas/pdf", { preHandler: [app.authenticate] }, async (request, reply) => {
    const ventas = getDb().prepare(`
      SELECT v.id, p.nombre AS producto, v.cantidad, v.precio_unitario, v.total, v.fecha
      FROM ventas v JOIN productos p ON p.id = v.producto_id
      WHERE v.anulada = 0 ORDER BY v.fecha DESC LIMIT 500
    `).all();
    const doc = generateVentasPDF(ventas);
    const chunks = [];
    for await (const chunk of doc) chunks.push(chunk);
    return reply.type("application/pdf")
      .header("Content-Disposition", "attachment; filename=ventas.pdf").send(Buffer.concat(chunks));
  });
}
