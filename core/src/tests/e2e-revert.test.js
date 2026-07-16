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
import { createProduct, listProducts, deleteProduct, restoreProduct, listTrashProducts } from "../services/products-service.js";
import { createSale } from "../services/sales-service.js";
import { listTransactions, revertTransaction, restoreTransaction } from "../services/transactions-service.js";
import { getStockReport, getProfitReport } from "../services/reports-service.js";

// ─── Helper: picks a product from listProducts results ───
function pick(products, name) {
  return (products.products || products).find(p => p.nombre === name);
}

// ─── Test: Issue #1 — Product restore from trash ───
describe("ISSUE 1: Product restore from trash", () => {
  let adminId, prod;

  beforeAll(() => {
    runMigrations(testDbRef.current);
    adminId = testDbRef.current.prepare("SELECT id FROM usuarios WHERE usuario = 'admin'").get()?.id;
  });

  it("creates a product", () => {
    prod = createProduct({ nombre: "RestoreTest", cantidad_stock: 10, precio: 1000, costo: 500, stock_minimo: 1 });
    expect(prod.id).toBeGreaterThan(0);
    expect(prod.nombre).toBe("RestoreTest");
  });

  it("deletes the product (moves to trash)", () => {
    const result = deleteProduct(prod.id, adminId);
    expect(result.trash).toBe(true);
    // should NOT be in active list
    const active = listProducts();
    expect(pick(active, "RestoreTest")).toBeUndefined();
    // SHOULD be in trash list
    const trash = listTrashProducts();
    expect(pick(trash, "RestoreTest")).toBeDefined();
  });

  it("restoreProduct service restores it correctly (endpoint: POST /productos/:id/restaurar)", () => {
    const result = restoreProduct(prod.id, adminId);
    expect(result.restored || result.id).toBeTruthy?.();
    // should be back in active list
    const active = listProducts();
    expect(pick(active, "RestoreTest")).toBeDefined();
    // should NOT be in trash
    const trash = listTrashProducts();
    expect(pick(trash, "RestoreTest")).toBeUndefined();
    // product should be active again
    const row = testDbRef.current.prepare("SELECT activo, en_papelera FROM productos WHERE id = ?").get(prod.id);
    expect(row.activo).toBe(1);
    expect(row.en_papelera).toBe(0);
  });
});

// ─── Test: Issue #2 — Reverted transactions filtered per tab ───
describe("ISSUE 2: Reverted transactions hidden from Todas/Ventas, only in Canceladas", () => {
  let adminId, productoId, saleId, movimientoId;

  beforeAll(() => {
    adminId = testDbRef.current.prepare("SELECT id FROM usuarios WHERE usuario = 'admin'").get()?.id;
    const prod = createProduct({ nombre: "FilterTest", cantidad_stock: 100, precio: 5000, costo: 3000, stock_minimo: 5 });
    productoId = prod.id;
  });

  it("STEP 1 — create a sale", () => {
    const sale = createSale({ productoId, cantidad: 3, usuarioId: adminId, precio_unitario: 5000 });
    expect(sale.id).toBeGreaterThan(0);
    saleId = sale.id;
    const mov = testDbRef.current.prepare("SELECT * FROM movimientos WHERE nota = ?").get(`Venta #${saleId}`);
    movimientoId = mov.id;
    expect(mov.revertida).toBe(0);
  });

  // ─── BEFORE revert: sale appears in all relevant tabs ───
  it("STEP 2 — BEFORE revert: sale appears in Todas (revertida=0)", () => {
    const result = listTransactions({ revertida: "0" });
    const found = result.find(t => t.id === movimientoId);
    expect(found).toBeDefined();
  });

  it("STEP 3 — BEFORE revert: sale appears in Ventas tab", () => {
    const result = listTransactions({ tipo: "venta", revertida: "0" });
    const found = result.find(t => t.id === movimientoId);
    expect(found).toBeDefined();
  });

  it("STEP 4 — BEFORE revert: sale does NOT appear in Canceladas (revertida=1)", () => {
    const result = listTransactions({ revertida: "1" });
    const found = result.find(t => t.id === movimientoId);
    expect(found).toBeUndefined();
  });

  // ─── REVERT the transaction ───
  it("STEP 5 — revert the transaction", () => {
    const result = revertTransaction({ movimientoId, usuarioId: adminId, motivo: "Filter test revert" });
    expect(result.reverted).toBe(true);
    const mov = testDbRef.current.prepare("SELECT revertida FROM movimientos WHERE id = ?").get(movimientoId);
    expect(mov.revertida).toBe(1);
  });

  // ─── AFTER revert: sale must be hidden from Todas/Ventas ───
  it("STEP 6 — AFTER revert: sale is HIDDEN from Todas (revertida=0)", () => {
    const result = listTransactions({ revertida: "0" });
    const found = result.find(t => t.id === movimientoId);
    expect(found).toBeUndefined();
  });

  it("STEP 7 — AFTER revert: sale is HIDDEN from Ventas tab", () => {
    const result = listTransactions({ tipo: "venta", revertida: "0" });
    const found = result.find(t => t.id === movimientoId);
    expect(found).toBeUndefined();
  });

  it("STEP 8 — AFTER revert: sale IS visible in Canceladas (revertida=1)", () => {
    const result = listTransactions({ revertida: "1" });
    const found = result.find(t => t.id === movimientoId);
    expect(found).toBeDefined();
    expect(found.revertida).toBe(1);
  });

  // ─── RESTORE the transaction ───
  it("STEP 9 — restore the reverted transaction (endpoint: POST /transacciones/:id/restaurar)", () => {
    const result = restoreTransaction({ movimientoId, usuarioId: adminId, motivo: "Filter test restore" });
    expect(result.restored).toBe(true);
    const mov = testDbRef.current.prepare("SELECT revertida FROM movimientos WHERE id = ?").get(movimientoId);
    expect(mov.revertida).toBe(0);
  });

  // ─── AFTER restore: sale is back ───
  it("STEP 10 — AFTER restore: sale is visible again in Todas", () => {
    const result = listTransactions({ revertida: "0" });
    const found = result.find(t => t.id === movimientoId);
    expect(found).toBeDefined();
    expect(found.revertida).toBe(0);
  });

  it("STEP 11 — AFTER restore: sale is visible again in Ventas", () => {
    const result = listTransactions({ tipo: "venta", revertida: "0" });
    const found = result.find(t => t.id === movimientoId);
    expect(found).toBeDefined();
  });

  it("STEP 12 — AFTER restore: sale is hidden from Canceladas", () => {
    const result = listTransactions({ revertida: "1" });
    const found = result.find(t => t.id === movimientoId);
    expect(found).toBeUndefined();
  });
});
