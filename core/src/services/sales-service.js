import { getDb } from "../db/connection.js";

export function createSale({ productoId, cantidad, usuarioId }) {
  const db = getDb();
  const product = db.prepare("SELECT * FROM productos WHERE id = ? AND activo = 1").get(productoId);
  if (!product) {
    const error = new Error("Producto no encontrado");
    error.statusCode = 404;
    throw error;
  }
  if (product.cantidad_stock < cantidad) {
    const error = new Error("Stock insuficiente para vender");
    error.statusCode = 409;
    throw error;
  }

  const total = product.precio * cantidad;
  let ventaId;

  const tx = () => {
    db.exec("BEGIN");
    db.prepare("UPDATE productos SET cantidad_stock = cantidad_stock - ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?")
      .run(cantidad, productoId);
    const sale = db.prepare(`
      INSERT INTO ventas (producto_id, cantidad, precio_unitario, total, usuario_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(productoId, cantidad, product.precio, total, usuarioId);
    ventaId = sale.lastInsertRowid;
    db.prepare(`
      INSERT INTO movimientos (producto_id, tipo, cantidad, usuario_id, nota)
      VALUES (?, 'venta', ?, ?, ?)
    `).run(productoId, cantidad, usuarioId, `Venta #${ventaId}`);
    db.exec("COMMIT");
  };

  try {
    tx();
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return db.prepare(`
    SELECT v.*, p.nombre AS producto_nombre
    FROM ventas v
    JOIN productos p ON p.id = v.producto_id
    WHERE v.id = ?
  `).get(ventaId);
}

export function listSales() {
  return getDb().prepare(`
    SELECT v.*, p.nombre AS producto_nombre, u.usuario
    FROM ventas v
    JOIN productos p ON p.id = v.producto_id
    JOIN usuarios u ON u.id = v.usuario_id
    WHERE v.anulada = 0
    ORDER BY v.fecha DESC
    LIMIT 100
  `).all();
}

export function deleteSale(ventaId, usuarioId) {
  const db = getDb();
  const venta = db.prepare("SELECT * FROM ventas WHERE id = ?").get(ventaId);
  if (!venta) {
    const error = new Error("Venta no encontrada");
    error.statusCode = 404;
    throw error;
  }
  if (venta.anulada) {
    const error = new Error("La venta ya esta anulada");
    error.statusCode = 400;
    throw error;
  }

  const tx = () => {
    db.exec("BEGIN");
    
    // 1. Restaurar stock
    db.prepare("UPDATE productos SET cantidad_stock = cantidad_stock + ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?")
      .run(venta.cantidad, venta.producto_id);
      
    // 2. Insertar movimiento compensatorio
    db.prepare(`
      INSERT INTO movimientos (producto_id, tipo, cantidad, usuario_id, nota)
      VALUES (?, 'entrada', ?, ?, ?)
    `).run(venta.producto_id, venta.cantidad, usuarioId, `Anulacion de venta #${venta.id}`);
    
    // 3. Marcar anulada
    db.prepare("UPDATE ventas SET anulada = 1 WHERE id = ?").run(venta.id);
    
    // 4. Auditoria
    db.prepare(`
      INSERT INTO bitacora_auditoria (usuario_id, entidad, entidad_id, accion, detalle)
      VALUES (?, 'venta', ?, 'eliminar', 'Anulacion de venta y restauracion de stock')
    `).run(usuarioId, venta.id);
    
    db.exec("COMMIT");
  };

  try {
    tx();
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { deleted: true };
}
