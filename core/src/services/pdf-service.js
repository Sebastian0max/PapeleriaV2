import PDFDocument from "pdfkit";

function drawTable(doc, headers, rows, startY) {
  const colW = 500 / headers.length;
  let y = startY;
  doc.fontSize(9).font("Helvetica-Bold");
  doc.rect(40, y, 500, 20).fill("#eee");
  doc.fill("#000");
  headers.forEach((h, i) => doc.text(h, 42 + colW * i, y + 5, { width: colW, align: "left" }));
  y += 22;
  doc.font("Helvetica").fontSize(8);
  rows.forEach((row, ri) => {
    if (y > 720) { doc.addPage(); y = 50; }
    if (ri % 2 === 0) doc.rect(40, y - 4, 500, 18).fill("#f9f9f9");
    doc.fill("#000");
    row.forEach((cell, i) => doc.text(String(cell ?? ""), 42 + colW * i, y, { width: colW, align: "left" }));
    y += 18;
  });
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", c => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export function generateProductosPDF(productos) {
  const doc = new PDFDocument({ margin: 40 });
  doc.fontSize(18).font("Helvetica-Bold").text("Inventario - Papeleria", { align: "center" });
  doc.fontSize(10).font("Helvetica").text(`Generado: ${new Date().toLocaleDateString("es-MX")}`, { align: "center" });
  doc.moveDown(1.5);
  const headers = ["ID", "Nombre", "Stock", "Precio", "Costo", "Ganancia"];
  const rows = productos.map(p => [
    p.id, p.nombre, p.cantidad_stock || p.stock,
    `$${Number(p.precio || p.precio_venta).toLocaleString("es-MX")}`,
    p.costo ? `$${Number(p.costo).toLocaleString("es-MX")}` : "-",
    p.costo ? `$${Number((p.precio || p.precio_venta) - p.costo).toLocaleString("es-MX")}` : "-"
  ]);
  drawTable(doc, headers, rows, doc.y);
  doc.end();
  return collectStream(doc);
}

export function generateVentasPDF(ventas) {
  const doc = new PDFDocument({ margin: 40 });
  doc.fontSize(18).font("Helvetica-Bold").text("Ventas - Papeleria", { align: "center" });
  doc.fontSize(10).font("Helvetica").text(`Generado: ${new Date().toLocaleDateString("es-MX")}`, { align: "center" });
  doc.moveDown(1.5);
  const headers = ["ID", "Producto", "Cant.", "P/U", "Total", "Fecha"];
  const rows = ventas.map(v => [
    v.id, v.producto, v.cantidad,
    `$${Number(v.precio_unitario).toLocaleString("es-MX")}`,
    `$${Number(v.total).toLocaleString("es-MX")}`,
    (v.fecha || v.created_at)?.split(" ")[0]
  ]);
  drawTable(doc, headers, rows, doc.y);
  doc.end();
  return collectStream(doc);
}
