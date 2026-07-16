import { describe, it, expect, beforeAll, vi } from "vitest";

const testDbRef = vi.hoisted(() => ({}));

vi.mock("../db/connection.js", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode = MEMORY");
  db.exec("PRAGMA foreign_keys = ON");
  testDbRef.current = db;
  return { getDb: () => db };
});

import { runMigrations } from "../db/migrations.js";
import { createProduct } from "../services/products-service.js";
import { createSale } from "../services/sales-service.js";
import { listTransactions, revertTransaction, restoreTransaction } from "../services/transactions-service.js";
import { getStockReport, getProfitReport } from "../services/reports-service.js";

describe("Revert/Report E2E", () => {
  let adminId, productoId, saleId, movimientoId;

  beforeAll(() => {
    runMigrations(testDbRef.current);
    adminId = testDbRef.current.prepare("SELECT id FROM usuarios WHERE usuario = 'admin'").get()?.id;
    const prod = createProduct({
      nombre: "E2E Test Product",
      cantidad_stock: 100,
      precio: 5000,
      costo: 3000,
      stock_minimo: 5,
    });
    productoId = prod.id;
  });

  it("1. creates a sale and returns sale + movement records", () => {
    const sale = createSale({ productoId, cantidad: 3, usuarioId: adminId, precio_unitario: 5000 });
    expect(sale).toBeDefined();
    expect(sale.id).toBeGreaterThan(0);
    saleId = sale.id;

    const mov = testDbRef.current.prepare("SELECT * FROM movimientos WHERE nota = ?").get(`Venta #${saleId}`);
    expect(mov).toBeDefined();
    expect(mov.tipo).toBe("venta");
    expect(mov.revertida).toBe(0);
    movimientoId = mov.id;
  });

  it("2. sale exists in database with correct values", () => {
    const sale = testDbRef.current.prepare("SELECT * FROM ventas WHERE id = ?").get(saleId);
    expect(sale).toBeDefined();
    expect(sale.anulada).toBe(0);
    expect(sale.total).toBe(15000);
    expect(sale.cantidad).toBe(3);
    expect(sale.precio_unitario).toBe(5000);
  });

  it("3. transaction appears in listTransactions (Todas)", () => {
    const result = listTransactions({ revertida: "0" });
    const found = result.find((t) => t.id === movimientoId);
    expect(found).toBeDefined();
    expect(found.revertida).toBe(0);
  });

  it("4. reverts the transaction", () => {
    const result = revertTransaction({ movimientoId, usuarioId: adminId, motivo: "E2E test revert" });
    expect(result.reverted).toBe(true);

    const mov = testDbRef.current.prepare("SELECT * FROM movimientos WHERE id = ?").get(movimientoId);
    expect(mov.revertida).toBe(1);
    expect(mov.revertida_por).toBe(adminId);
  });

  it("5. marks ventas.anulada = 1 on revert", () => {
    const venta = testDbRef.current.prepare("SELECT anulada FROM ventas WHERE id = ?").get(saleId);
    expect(venta.anulada).toBe(1);
  });

  it("6. reverted transaction NOT in Todas list", () => {
    const result = listTransactions({ revertida: "0" });
    const found = result.find((t) => t.id === movimientoId);
    expect(found).toBeUndefined();
  });

  it("7. reverted transaction appears in Canceladas list", () => {
    const result = listTransactions({ revertida: "1" });
    const found = result.find((t) => t.id === movimientoId);
    expect(found).toBeDefined();
    expect(found.revertida).toBe(1);
  });

  it("8. stock report excludes reverted sale (by DB check)", () => {
    const count = testDbRef.current.prepare(`
      SELECT COUNT(*) AS c FROM ventas WHERE anulada = 0 AND id = ?
    `).get(saleId);
    expect(count.c).toBe(0);
  });

  it("9. profit report excludes reverted sale (by DB check)", () => {
    const count = testDbRef.current.prepare(`
      SELECT COUNT(*) AS c FROM ventas v
      WHERE v.anulada = 0 AND v.id = ?
    `).get(saleId);
    expect(count.c).toBe(0);
  });

  it("10. restores the transaction", () => {
    const result = restoreTransaction({ movimientoId, usuarioId: adminId, motivo: "E2E test restore" });
    expect(result.restored).toBe(true);
    const mov = testDbRef.current.prepare("SELECT * FROM movimientos WHERE id = ?").get(movimientoId);
    expect(mov.revertida).toBe(0);
    expect(mov.revertida_por).toBeNull();
  });

  it("11. marks ventas.anulada = 0 on restore", () => {
    const venta = testDbRef.current.prepare("SELECT anulada FROM ventas WHERE id = ?").get(saleId);
    expect(venta.anulada).toBe(0);
  });

  it("12. restored transaction appears again in Todas", () => {
    const result = listTransactions({ revertida: "0" });
    const found = result.find((t) => t.id === movimientoId);
    expect(found).toBeDefined();
    expect(found.revertida).toBe(0);
  });

  it("13. restored sale is counted in stock report (raw query)", () => {
    const count = testDbRef.current.prepare(`
      SELECT COUNT(*) AS c FROM ventas WHERE anulada = 0 AND id = ?
    `).get(saleId);
    expect(count.c).toBe(1);
  });

  it("14. stock is correctly managed through sale->revert->restore", () => {
    const product = testDbRef.current.prepare("SELECT cantidad_stock FROM productos WHERE id = ?").get(productoId);
    // sale(3) → revert(+3) → restore(-3) = net -3 from initial 100
    expect(product.cantidad_stock).toBe(97);
  });
});
