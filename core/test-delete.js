import { getDb } from "./src/db/connection.js";
import { deleteProduct, listProducts } from "./src/services/products-service.js";

const db = getDb();

// 1. Insert a dummy product
const skuDel = `TEST-DEL-${Date.now()}`;
const barcodeDel = `BAR-${Date.now()}`;
const insertResult = db.prepare(`
  INSERT INTO productos (nombre, sku, codigo_barras, cantidad_stock, precio, activo)
  VALUES ('Test Delete', ?, ?, 10, 100, 1)
`).run(skuDel, barcodeDel);
const productId = insertResult.lastInsertRowid;
console.log("Inserted Product ID:", productId);

// 2. Verify it's in the list
let products = listProducts({});
console.log("Product in list before delete?", products.some(p => p.id === productId));

// 3. Delete it
const deleteResult = deleteProduct(productId, 1); // 1 = admin userId
console.log("Delete result:", deleteResult);

// 4. Verify it's no longer in the list
products = listProducts({});
console.log("Product in list after delete?", products.some(p => p.id === productId));

// 5. Check if it's still in the DB (should be physically deleted since it has no history)
const inDb = db.prepare("SELECT * FROM productos WHERE id = ?").get(productId);
console.log("Product in DB after delete?", !!inDb);

// 6. Test soft delete
// Insert another
const skuSoft = `TEST-SOFT-${Date.now()}`;
const softDelResult = db.prepare(`
  INSERT INTO productos (nombre, sku, cantidad_stock, precio, activo)
  VALUES ('Test Soft Delete', ?, 10, 100, 1)
`).run(skuSoft);
const softId = softDelResult.lastInsertRowid;

// Add a fake sale to give it history
db.prepare(`
  INSERT INTO ventas (producto_id, cantidad, precio_unitario, total, usuario_id, fecha, anulada)
  VALUES (?, 1, 100, 100, 1, CURRENT_TIMESTAMP, 0)
`).run(softId);

// Delete it
const softDelResp = deleteProduct(softId, 1);
console.log("\nSoft Delete result:", softDelResp);

products = listProducts({});
console.log("Soft Deleted product in list after delete?", products.some(p => p.id === softId));

const softInDb = db.prepare("SELECT activo FROM productos WHERE id = ?").get(softId);
console.log("Soft Deleted product 'activo' status in DB:", softInDb.activo);
