import { getDb } from "../db/connection.js";
import { logAudit } from "./audit-service.js";

export function listTransactions({ limit = 50, offset = 0, fechaDesde, fechaHasta, producto, tipo, revertida }) {
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
  if (tipo) {
    filters.push("m.tipo = ?");
    params.push(tipo);
  }
  if (revertida === "1") {
    filters.push("m.revertida = 1");
  } else if (revertida === "0") {
    filters.push("m.revertida = 0");
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const data = db.prepare(`
    SELECT m.*, 
           p.nombre AS producto_nombre, 
           u.usuario AS usuario_nombre,
           (SELECT u2.usuario FROM usuarios u2 WHERE u2.id = m.revertida_por) AS revertida_por_usuario
    FROM movimientos m
    JOIN productos p ON m.producto_id = p.id
    JOIN usuarios u ON m.usuario_id = u.id
    ${where}
    ORDER BY m.revertida ASC, m.fecha DESC
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

export function revertTransaction({ movimientoId, usuarioId, motivo }) {
  const db = getDb();

  const original = db.prepare("SELECT m.*, p.nombre AS producto_nombre, p.cantidad_stock AS stock_actual FROM movimientos m JOIN productos p ON p.id = m.producto_id WHERE m.id = ?").get(movimientoId);
  if (!original) {
    const error = new Error("Transaccion no encontrada.");
    error.statusCode = 404;
    throw error;
  }

  if (original.revertida) {
    const error = new Error("Esta transaccion ya fue revertida anteriormente.");
    error.statusCode = 400;
    throw error;
  }

  if (original.tipo === "venta") {
    // Revertir venta = sumar stock
    const tx = () => {
      db.exec("BEGIN");

      db.prepare("UPDATE productos SET cantidad_stock = cantidad_stock + ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?")
        .run(original.cantidad, original.producto_id);

      db.prepare(`
        INSERT INTO movimientos (producto_id, tipo, cantidad, usuario_id, nota, revertida, revertida_por, motivo_reversion)
        VALUES (?, 'entrada', ?, ?, ?, 0, ?, ?)
      `).run(
        original.producto_id,
        original.cantidad,
        usuarioId,
        `Reversion de ${original.tipo} #${original.id}: ${original.producto_nombre}${motivo ? ` - ${motivo}` : ""}`,
        null,
        motivo || null
      );

      db.prepare("UPDATE movimientos SET revertida = 1, revertida_por = ?, motivo_reversion = ? WHERE id = ?")
        .run(usuarioId, motivo || null, movimientoId);

      db.prepare(`
        INSERT INTO bitacora_reversiones (usuario_id, movimiento_id, motivo)
        VALUES (?, ?, ?)
      `).run(usuarioId, movimientoId, motivo || null);

      db.prepare(`
        INSERT INTO bitacora_auditoria (usuario_id, entidad, entidad_id, accion, detalle)
        VALUES (?, 'movimiento', ?, 'revertir', ?)
      `).run(usuarioId, movimientoId, motivo || "Reversion de transaccion");

      db.exec("COMMIT");
    };

    try {
      tx();
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return { reverted: true, message: "Venta revertida correctamente. El stock fue restaurado." };
  }

  if (original.tipo === "entrada") {
    // Revertir entrada = restar stock
    if (original.stock_actual < original.cantidad) {
      const error = new Error(`No se puede revertir esta entrada: el stock actual (${original.stock_actual}) es menor que la cantidad a revertir (${original.cantidad}).`);
      error.statusCode = 409;
      throw error;
    }

    const tx = () => {
      db.exec("BEGIN");

      db.prepare("UPDATE productos SET cantidad_stock = cantidad_stock - ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?")
        .run(original.cantidad, original.producto_id);

      db.prepare(`
        INSERT INTO movimientos (producto_id, tipo, cantidad, usuario_id, nota, revertida, revertida_por, motivo_reversion)
        VALUES (?, 'salida', ?, ?, ?, 0, ?, ?)
      `).run(
        original.producto_id,
        original.cantidad,
        usuarioId,
        `Reversion de ${original.tipo} #${original.id}: ${original.producto_nombre}${motivo ? ` - ${motivo}` : ""}`,
        null,
        motivo || null
      );

      db.prepare("UPDATE movimientos SET revertida = 1, revertida_por = ?, motivo_reversion = ? WHERE id = ?")
        .run(usuarioId, motivo || null, movimientoId);

      db.prepare(`
        INSERT INTO bitacora_reversiones (usuario_id, movimiento_id, motivo)
        VALUES (?, ?, ?)
      `).run(usuarioId, movimientoId, motivo || null);

      db.prepare(`
        INSERT INTO bitacora_auditoria (usuario_id, entidad, entidad_id, accion, detalle)
        VALUES (?, 'movimiento', ?, 'revertir', ?)
      `).run(usuarioId, movimientoId, motivo || "Reversion de transaccion");

      db.exec("COMMIT");
    };

    try {
      tx();
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return { reverted: true, message: "Entrada revertida correctamente. El stock fue ajustado." };
  }

  if (original.tipo === "salida" || original.tipo === "ajuste") {
    // Revertir salida/ajuste = sumar stock
    const tx = () => {
      db.exec("BEGIN");

      db.prepare("UPDATE productos SET cantidad_stock = cantidad_stock + ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?")
        .run(original.cantidad, original.producto_id);

      db.prepare(`
        INSERT INTO movimientos (producto_id, tipo, cantidad, usuario_id, nota, revertida, revertida_por, motivo_reversion)
        VALUES (?, 'entrada', ?, ?, ?, 0, ?, ?)
      `).run(
        original.producto_id,
        original.cantidad,
        usuarioId,
        `Reversion de ${original.tipo} #${original.id}: ${original.producto_nombre}${motivo ? ` - ${motivo}` : ""}`,
        null,
        motivo || null
      );

      db.prepare("UPDATE movimientos SET revertida = 1, revertida_por = ?, motivo_reversion = ? WHERE id = ?")
        .run(usuarioId, motivo || null, movimientoId);

      db.prepare(`
        INSERT INTO bitacora_reversiones (usuario_id, movimiento_id, motivo)
        VALUES (?, ?, ?)
      `).run(usuarioId, movimientoId, motivo || null);

      db.prepare(`
        INSERT INTO bitacora_auditoria (usuario_id, entidad, entidad_id, accion, detalle)
        VALUES (?, 'movimiento', ?, 'revertir', ?)
      `).run(usuarioId, movimientoId, motivo || "Reversion de transaccion");

      db.exec("COMMIT");
    };

    try {
      tx();
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return { reverted: true, message: `${original.tipo === "salida" ? "Salida" : "Ajuste"} revertido correctamente. El stock fue restaurado.` };
  }

  const error = new Error("Tipo de transaccion no soportado para reversion.");
  error.statusCode = 400;
  throw error;
}
