import { getDb } from "./src/db/connection.js";
import { updateProduct } from "./src/services/products-service.js";

const db = getDb();
const firstProduct = db.prepare("SELECT * FROM productos WHERE activo = 1 LIMIT 1").get();
console.log("Original Product:", firstProduct.nombre, firstProduct.cantidad_stock, firstProduct.precio);

try {
  const updated = updateProduct(firstProduct.id, {
    nombre: "Test Edit " + Date.now(),
    precio: 999,
    cantidad_stock: 777
  }, 1);
  console.log("Updated Product:", updated.nombre, updated.cantidad_stock, updated.precio);
} catch (error) {
  console.error("Edit Failed:", error);
}
