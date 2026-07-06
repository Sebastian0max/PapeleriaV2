import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Boxes,
  Download,
  ImagePlus,
  LogOut,
  PackagePlus,
  Search,
  Settings,
  ShoppingCart,
  Trash2,
  Upload,
  Users
} from "lucide-react";
import "./styles.css";

// Global error boundary to catch unexpected render errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>⚠️ Ocurrió un error inesperado</h2>
          <p>Por favor recarga la página o contacta al soporte.</p>
          <pre style={{ color: 'red', textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
            {this.state.error && this.state.error.toString()}
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}


const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:4000";
const ACTIONS = ["ver", "crear", "editar", "eliminar"];

function normalizePath(p) { return '/' + p.replace(/^\/+/, '').replace(/\/+$/, ''); }
function api(token, path, options = {}) {
  const isForm = options.body instanceof FormData;
  const hasJsonBody = options.body && !isForm;
  const base = API_URL.replace(/\/+$/, '');
  const cleanPath = normalizePath(path);
  return fetch(`${base}${cleanPath}`, {
    ...options,
    headers: {
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async (res) => {
    const type = res.headers.get("content-type") || "";
    const data = type.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) throw new Error(data.message || data || "Error de servidor");
    return data;
  });
}

function App() {
  const [session, setSession] = useState(null);

  if (!session) return <Login onLogin={setSession} />;
  return <Dashboard session={session} onLogout={() => {
    setSession(null);
  }} />;
}

function Login({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await api(null, "/auth/login", {
        method: "POST",
        body: JSON.stringify({ usuario, password })
      });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <Boxes size={40} />
        <h1>Sistema Papeleria</h1>
        <label>Usuario<input placeholder="admin" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus /></label>
        <label>Password<input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button>Entrar</button>
      </form>
    </main>
  );
}

function ConfirmModal({ isOpen, title, content, onConfirm, onCancel }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{title}</h3>
        <p style={{ whiteSpace: "pre-line", margin: "16px 0" }}>{content}</p>
        <div className="modal-actions" style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button className="danger" onClick={onConfirm}>Si, eliminar</button>
          <button onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ session, onLogout }) {
  const token = session.token;
  const permissions = session.user.permisos || [];
  const can = (key) => session.user.rol === "admin" || permissions.includes(key);
  const canAdmin = (key) => session.user.rol === "admin" && can(key);
  const [view, setView] = useState("inventario");
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saleToDelete, setSaleToDelete] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);

  async function confirmDeleteSale() {
    if (!saleToDelete) return;
    try {
      const result = await api(token, `/ventas/${saleToDelete.id}`, { method: "DELETE" });
      setMessage(result.message || "Venta eliminada");
      setTimeout(() => setMessage(""), 5000);
      load();
    } catch (err) {
      setError(err.message);
    }
    setSaleToDelete(null);
  }

  async function confirmDeleteProduct() {
    if (!productToDelete) return;
    try {
      console.log(`[Frontend] Confirmando eliminación de producto ${productToDelete.id}`);
      const result = await api(token, `/productos/${productToDelete.id}`, { method: "DELETE" });
      console.log(`[Frontend] Respuesta de eliminación producto:`, result);
      setMessage(result.message || "Producto eliminado");
      setTimeout(() => setMessage(""), 5000);
      await load();
    } catch (err) {
      console.error("[Frontend] Error al eliminar producto:", err);
      alert("Error al eliminar: " + err.message);
    }
    setProductToDelete(null);
  }

  async function load(searchOverride = search) {
    try {
      const tasks = [];
      if (can("productos:ver")) tasks.push(api(token, `/productos?search=${encodeURIComponent(searchOverride)}`));
      if (can("ventas:ver")) tasks.push(api(token, "/ventas"));
      if (can("reportes:ver")) tasks.push(api(token, "/reportes/stock"));
      const [productData, saleData, reportData] = await Promise.all(tasks);
      if (productData?.products) setProducts(productData.products);
      if (saleData?.sales) setSales(saleData.sales);
      if (reportData) setReport(reportData);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [search]);

  const totalStock = useMemo(() => products.reduce((sum, item) => sum + item.cantidad_stock, 0), [products]);
  const showConfig = session.user.rol === "admin" && can("configuracion:ver");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>{view === "config" ? "Configuracion" : "Inventario"}</h1>
          <span>{session.user.usuario} - {session.user.rol}</span>
        </div>
        <nav className="tabs">
          <button className={view === "inventario" ? "active" : ""} onClick={() => setView("inventario")}><Boxes size={17} />Inventario</button>
          <button className={view === "ventas" ? "active" : ""} onClick={() => setView("ventas")}><ShoppingCart size={17} />Transacciones</button>
          {showConfig && <button className={view === "config" ? "active" : ""} onClick={() => setView("config")}><Settings size={17} />Config</button>}
        </nav>
        <button className="icon-button" onClick={onLogout} title="Salir"><LogOut /></button>
      </header>

      {error && <p className="error">{error}</p>}
      {message && <p className="success" style={{ margin: "0 0 20px" }}>{message}</p>}

      {view !== "config" && (
        <section className="metrics">
          <Metric icon={<Boxes />} label="Productos" value={products.length} />
          <Metric icon={<PackagePlus />} label="Unidades en stock" value={totalStock} />
          <Metric icon={<ShoppingCart />} label="Ventas recientes" value={sales.length} />
        </section>
      )}

      {view === "inventario" && (
        <section className="workspace">
          <div className="panel inventory-panel">
            <div className="panel-head">
              <h2>Productos</h2>
              <div className="search"><Search size={18} /><input placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            </div>
            {canAdmin("productos:crear") && <ProductForm token={token} onDone={() => { setMessage("Producto creado con exito"); setTimeout(() => setMessage(""), 3000); load(); }} />}
            <div className="table">
              {products.map((product) => (
                <ProductRow key={product.id} product={product} token={token} onDone={load} onMessage={(m) => { setMessage(m); setTimeout(() => setMessage(""), 5000); }} can={canAdmin} onDeleteRequest={setProductToDelete} />
              ))}
            </div>
          </div>
          <div className="panel side-panel">
            <h2>Stock</h2>
            <Report report={report} />
          </div>
        </section>
      )}

      {view === "ventas" && (
        <section className="workspace">
          <div className="panel">
            <h2>Vender</h2>
            {can("ventas:crear") && <SaleForm token={token} products={products} onDone={load} />}
            <TransactionsList token={token} />
          </div>
          <div className="panel side-panel">
            <h2>Reportes</h2>
            <Report report={report} />
          </div>
        </section>
      )}

      {view === "config" && <Config token={token} can={can} onImported={async () => {
        setSearch("");
        await load("");
        setView("inventario");
      }} />}
      <ConfirmModal
        isOpen={!!saleToDelete}
        title="Eliminar Venta"
        content={saleToDelete ? `Producto: ${saleToDelete.producto_nombre}\nCantidad: ${saleToDelete.cantidad}\nTotal: $${saleToDelete.total}\nFecha: ${saleToDelete.fecha}\n\n¿Estas seguro de anular esta venta? El stock será devuelto al inventario.` : ""}
        onConfirm={confirmDeleteSale}
        onCancel={() => setSaleToDelete(null)}
      />
      <ConfirmModal
        isOpen={!!productToDelete}
        title="Eliminar Producto"
        content={productToDelete ? `Producto: ${productToDelete.nombre}\nCantidad en stock: ${productToDelete.cantidad_stock}\n\n¿Estás seguro de eliminar este producto?` : ""}
        onConfirm={confirmDeleteProduct}
        onCancel={() => setProductToDelete(null)}
      />
    </main>
  );
}

function Metric({ icon, label, value }) {
  return <div className="metric">{icon}<div><span>{label}</span><strong>{value}</strong></div></div>;
}

function ProductForm({ token, onDone }) {
  const empty = { nombre: "", cantidad_stock: "", precio: "" };
  const [form, setForm] = useState(empty);
  const [image, setImage] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const payload = {
      nombre: form.nombre,
      cantidad_stock: Number(form.cantidad_stock) || 0,
      precio: Number(form.precio) || 0,
      stock_minimo: 0,
      codigo_barras: "",
      sku: "",
      categoria: ""
    };
    const data = await api(token, "/productos", { method: "POST", body: JSON.stringify(payload) });
    if (image) {
      const fd = new FormData();
      fd.append("file", image);
      await api(token, `/productos/${data.product.id}/imagen`, { method: "POST", body: fd });
    }
    setForm(empty);
    setImage(null);
    onDone();
  }

  return (
    <form className="product-form" onSubmit={submit} style={{ gridTemplateColumns: "1fr 150px 150px 42px 42px" }}>
      <label><span style={{ fontWeight: "normal", fontSize: "12px", color: "#667479" }}>Nombre de producto</span><input required placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
      <label><span style={{ fontWeight: "normal", fontSize: "12px", color: "#667479" }}>Unidades en stock</span><input required type="number" min="0" placeholder="Unidades" value={form.cantidad_stock} onChange={(e) => setForm({ ...form, cantidad_stock: e.target.value })} /></label>
      <label><span style={{ fontWeight: "normal", fontSize: "12px", color: "#667479" }}>Precio de venta</span><input required type="number" min="0" placeholder="Precio" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} /></label>
      <label className="file-button" title="Imagen" style={{ alignSelf: "end" }}><ImagePlus size={18} /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setImage(e.target.files?.[0] || null)} /></label>
      <button title="Agregar producto" style={{ alignSelf: "end" }}><PackagePlus size={18} /></button>
    </form>
  );
}

function ProductRow({ product, token, onDone, onMessage, can, onDeleteRequest }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  async function move(tipo) {
    const cantidad = Number(prompt(`Cantidad para ${tipo}`, "1"));
    if (!cantidad) return;
    await api(token, `/productos/${product.id}/movimientos`, {
      method: "POST",
      body: JSON.stringify({ tipo, cantidad })
    });
    onDone();
  }

  function startEdit() {
    setEditForm({
      nombre: product.nombre,
      precio: product.precio,
      cantidad_stock: product.cantidad_stock
    });
    setIsEditing(true);
  }

  async function saveEdit() {
    try {
      const payload = {
        nombre: editForm.nombre,
        precio: Number(editForm.precio) || 0,
        cantidad_stock: Number(editForm.cantidad_stock) || 0
      };
      await api(token, `/productos/${product.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setIsEditing(false);
      await onDone();
    } catch (err) {
      alert("Error al guardar: " + err.message);
    }
  }

  if (isEditing) {
    return (
      <div className="row product-row" style={{ gridTemplateColumns: "1fr auto" }}>
        <div style={{ display: "grid", gap: "8px", gridTemplateColumns: "1fr 120px 120px" }}>
          <input placeholder="Nombre" value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} />
          <div className="stock-col"><input type="number" placeholder="Cantidad" style={{ width: "100%" }} value={editForm.cantidad_stock} onChange={(e) => setEditForm({ ...editForm, cantidad_stock: e.target.value })} /></div>
          <input type="number" placeholder="Precio" value={editForm.precio} onChange={(e) => setEditForm({ ...editForm, precio: e.target.value })} />
        </div>
        <div className="actions">
          <button onClick={saveEdit}>Guardar</button>
          <button className="danger" onClick={() => setIsEditing(false)}>Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="row product-row">
      <div className="product-title">
        {product.thumbnail_url ? <img src={product.thumbnail_url.startsWith("http") ? product.thumbnail_url : `${API_URL.replace(/[\/\\]+$/, '')}${normalizePath(product.thumbnail_url)}`} alt="" /> : <span className="thumb" />}
        <div><strong>{product.nombre}</strong><span>${product.precio}</span></div>
      </div>
      <span className="stock-col">{product.cantidad_stock} uds</span>
      <div className="actions">
        {can("stock:crear") && <button onClick={() => move("entrada")} title="Añadir stock">+</button>}
        {can("stock:crear") && <button onClick={() => move("salida")} title="Restar stock">-</button>}
        {can("productos:editar") && <button onClick={startEdit}>Editar</button>}
        {can("productos:eliminar") && <button className="danger" onClick={() => onDeleteRequest(product)} title="Eliminar"><Trash2 size={16} /></button>}
      </div>
    </div>
  );
}

function SaleForm({ token, products, onDone }) {
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Update selected product when product ID changes
  useEffect(() => {
    const prod = products.find(p => p.id === productoId);
    setSelectedProduct(prod || null);
    // Reset messages when product changes
    setMessage("");
    setError("");
  }, [productoId, products]);

  async function submit(event) {
    event.preventDefault();
    if (!productoId) return;
    if (!selectedProduct) return;
    // Validate stock
    if (cantidad > selectedProduct.cantidad_stock) {
      setError(`Cantidad solicitada (${cantidad}) supera el stock disponible (${selectedProduct.cantidad_stock}).`);
      return;
    }
    try {
      await api(token, "/ventas", { method: "POST", body: JSON.stringify({ productoId, cantidad }) });
      // Success message
      const total = selectedProduct.precio * cantidad;
      setMessage(`Venta exitosa: ${cantidad} unidades de ${selectedProduct.nombre} por $${total.toLocaleString()}`);
      setError("");
      setCantidad(1);
      setProductoId("");
      onDone();
    } catch (err) {
      setError(err.message);
      setMessage("");
    }
  }

  return (
    <form className="sale-form" onSubmit={submit}>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
        <option value="">Producto</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.nombre}
          </option>
        ))}
      </select>
      {selectedProduct && (
        <p className="stock-info">Stock disponible: {selectedProduct.cantidad_stock} unidades</p>
      )}
      <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
      <button title="Vender">
        <ShoppingCart size={18} />
      </button>
    </form>
  );
}

function Report({ report }) {
  if (!report) return null;
  return (
    <div className="report">
      <h3>Top del Dia</h3>
      {report.ventasDia.top.map((p, i) => <div className="report-line" key={p.id}><span>{i + 1}. {p.nombre}</span><strong>{p.cantidad} uds</strong></div>)}
      <div className="report-line" style={{ borderTop: "1px solid #edf1f2", paddingTop: "6px" }}><span>Total ingresos dia:</span><strong>${report.ventasDia.ingresos}</strong></div>

      <h3 style={{ marginTop: "16px" }}>Top de la Semana</h3>
      {report.ventasSemana.top.map((p, i) => <div className="report-line" key={p.id}><span>{i + 1}. {p.nombre}</span><strong>{p.cantidad} uds</strong></div>)}
      <div className="report-line" style={{ borderTop: "1px solid #edf1f2", paddingTop: "6px" }}><span>Total ingresos semana:</span><strong>${report.ventasSemana.ingresos}</strong></div>

      <h3 style={{ marginTop: "16px" }}>Top del Mes</h3>
      {report.ventasMes.top.map((p, i) => <div className="report-line" key={p.id}><span>{i + 1}. {p.nombre}</span><strong>{p.cantidad} uds</strong></div>)}
      <div className="report-line" style={{ borderTop: "1px solid #edf1f2", paddingTop: "6px" }}><span>Total ingresos mes:</span><strong>${report.ventasMes.ingresos}</strong></div>

      <h3 style={{ marginTop: "16px" }}>Productos con bajo stock</h3>
      {(report.agotados || []).map((p) => <div className="report-line" key={p.id}><span className="error">{p.nombre} (Agotado)</span><strong>{p.cantidad_stock} uds</strong></div>)}
      {(report.bajoStock || []).map((p) => <div className="report-line" key={p.id}><span className="warning" style={{ padding: "0", border: "0", background: "transparent" }}>{p.nombre}</span><strong>{p.cantidad_stock} uds</strong></div>)}
    </div>
  );
}

function ReportList({ title, items }) {
  return (
    <div>
      <h3>{title}</h3>
      {items.length === 0 ? <p className="muted">Sin datos</p> : items.slice(0, 5).map((item) => (
        <p key={item.id} className="report-line"><span>{item.nombre}</span><strong>{item.cantidad ?? item.vendidos ?? item.cantidad_stock}</strong></p>
      ))}
    </div>
  );
}

function Config({ token, can, onImported }) {
  const [section, setSection] = useState("importacion");
  return (
    <section className="config-grid">
      <aside className="panel config-menu">
        {can("importacion:ver") && <button className={section === "importacion" ? "active" : ""} onClick={() => setSection("importacion")}><Upload size={17} />Importacion</button>}
        {can("usuarios:ver") && <button className={section === "usuarios" ? "active" : ""} onClick={() => setSection("usuarios")}><Users size={17} />Usuarios</button>}
        {can("roles:ver") && <button className={section === "roles" ? "active" : ""} onClick={() => setSection("roles")}><Settings size={17} />Roles</button>}
        {can("importacion:ver") && <button className={section === "bitacora" ? "active" : ""} onClick={() => setSection("bitacora")}><Boxes size={17} />Bitacora</button>}
      </aside>
      {section === "importacion" && <ImportPanel token={token} onImported={onImported} />}
      {section === "usuarios" && <UsersPanel token={token} />}
      {section === "roles" && <RolesPanel token={token} />}
      {section === "bitacora" && <ImportLogPanel token={token} />}
    </section>
  );
}

function ImportPanel({ token, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function downloadTemplate() {
    const text = await api(token, "/importaciones/plantilla");
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "plantilla-productos.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage("");
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await api(token, "/importaciones/preview", { method: "POST", body: fd });
      setPreview(data.preview);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    const hasReductions = preview.actualizados.some((item) => item.disminuyeStock);
    const noQtyWarning = preview.noQuantityColumn ? "AVISO: Este archivo no incluye columna de unidades (el stock no se alterará). " : "";
    const text = hasReductions
      ? `${noQtyWarning}Hay productos cuyo stock bajará frente al valor actual. Confirmas disminuir esos valores?`
      : `${noQtyWarning}Confirmas importar este archivo y aplicar los datos?`;
    if (!confirm(text)) return;

    setBusy(true);
    try {
      const data = await api(token, "/importaciones/confirmar", { method: "POST", body: JSON.stringify({ token: preview.token }) });
      setMessage(`Importacion aplicada: ${data.result.created} creados, ${data.result.updated} actualizados, ${data.result.unchanged || 0} sin cambios.`);
      setPreview(null);
      setFile(null);
      await onImported();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Importacion Excel/CSV</h2>
        <button className="link-button" type="button" onClick={downloadTemplate}><Download size={17} />Plantilla</button>
      </div>
      <form className="upload-line" onSubmit={importFile}>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button disabled={busy || !file}><Upload size={17} />{busy ? "Importando" : "Importar"}</button>
      </form>
      {message && <p className="success">{message}</p>}
      {preview && <ImportPreview preview={preview} onConfirm={confirmImport} />}
    </div>
  );
}

function ImportPreview({ preview, onConfirm }) {
  const reductions = preview.actualizados.filter((item) => item.disminuyeStock).length;
  const total = preview.nuevos.length + preview.actualizados.length + preview.errores.length + preview.unchanged;
  return (
    <div className="preview">
      <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", marginBottom: "16px", display: "flex", gap: "16px" }}>
        <span><strong>Total procesado:</strong> {total} filas</span>
        <span><strong>Sin cambios:</strong> {preview.unchanged}</span>
      </div>
      {preview.noQuantityColumn && <p className="warning">Este archivo no incluye columna de unidades. El stock existente se mantendrá intacto.</p>}
      {reductions > 0 && <p className="warning">{reductions} producto(s) quedaran con stock menor al actual.</p>}
      <h3>Nuevos a crear ({preview.nuevos.length})</h3>
      <PreviewTable rows={preview.nuevos.map((x) => ({ row: x.rowNumber, nombre: x.nuevo.nombre, stock: x.nuevo.cantidad_stock ?? 0, precio: x.nuevo.precio ?? 0 }))} />
      <h3>Existentes a actualizar ({preview.actualizados.length})</h3>
      <PreviewTable rows={preview.actualizados.map((x) => ({ row: x.rowNumber, nombre: x.nombre, stock: `${x.anterior.cantidad_stock} -> ${x.nuevo.cantidad_stock ?? x.anterior.cantidad_stock}`, precio: `${x.anterior.precio} -> ${x.nuevo.precio ?? x.anterior.precio}`, alerta: x.disminuyeStock ? "Disminuye stock" : "" }))} />
      <h3>Filas con errores ({preview.errores.length})</h3>
      <PreviewTable rows={preview.errores.map((x) => ({ row: x.rowNumber, nombre: x.row.nombre || "Fila sin nombre", stock: x.row.cantidad ?? "-", precio: x.row.precio ?? "-", alerta: x.errores.join(", ") }))} />
      <button onClick={onConfirm}>Confirmar importacion</button>
    </div>
  );
}

function PreviewTable({ rows }) {
  if (rows.length === 0) return <p className="muted">Sin filas</p>;
  return <div className="mini-table">{rows.slice(0, 20).map((row, i) => <div className="mini-row" key={i}><span>#{row.row}</span><strong>{row.nombre}</strong><span>{row.stock}</span><span>{row.precio}</span><em>{row.alerta}</em></div>)}</div>;
}

function UsersPanel({ token }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ usuario: "", password: "", rol_id: "" });

  async function load() {
    const [userData, roleData] = await Promise.all([api(token, "/usuarios"), api(token, "/roles")]);
    setUsers(userData.users);
    setRoles(roleData.roles);
    if (!form.rol_id && roleData.roles[0]) setForm((x) => ({ ...x, rol_id: roleData.roles[0].id }));
  }
  useEffect(() => { load(); }, []);

  async function create(event) {
    event.preventDefault();
    await api(token, "/usuarios", { method: "POST", body: JSON.stringify({ ...form, rol_id: Number(form.rol_id) }) });
    setForm({ usuario: "", password: "", rol_id: roles[0]?.id || "" });
    load();
  }

  async function deactivate(id) {
    if (!confirm("Desactivar usuario?")) return;
    await api(token, `/usuarios/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="panel">
      <h2>Usuarios</h2>
      <form className="user-form" onSubmit={create}>
        <input placeholder="Usuario" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
        <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select value={form.rol_id} onChange={(e) => setForm({ ...form, rol_id: e.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.nombre}</option>)}</select>
        <button>Crear</button>
      </form>
      <div className="table">{users.map((user) => <div className="row" key={user.id}><div><strong>{user.usuario}</strong><span>{user.rol}</span></div><span>{user.activo ? "Activo" : "Inactivo"}</span><button className="danger" onClick={() => deactivate(user.id)}>Desactivar</button></div>)}</div>
    </div>
  );
}

function RolesPanel({ token }) {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selected, setSelected] = useState(null);

  async function load() {
    const data = await api(token, "/roles");
    setRoles(data.roles);
    setPermissions(data.permissions);
    setSelected((current) => current || data.roles[0] || null);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    const path = selected.id ? `/roles/${selected.id}` : "/roles";
    await api(token, path, { method: selected.id ? "PUT" : "POST", body: JSON.stringify(selected) });
    setSelected(null);
    load();
  }

  const modules = [...new Set(permissions.map((item) => item.modulo))];
  const toggle = (key) => {
    const current = new Set(selected.permisos || []);
    current.has(key) ? current.delete(key) : current.add(key);
    setSelected({ ...selected, permisos: [...current] });
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Roles y permisos</h2>
        <button onClick={() => setSelected({ nombre: "Nuevo rol", permisos: [] })}>Nuevo rol</button>
      </div>
      <div className="role-layout">
        <div className="role-list">{roles.map((role) => <button className={selected?.id === role.id ? "active" : ""} onClick={() => setSelected(role)} key={role.id}>{role.nombre}</button>)}</div>
        {selected && <div className="permissions">
          <input value={selected.nombre} onChange={(e) => setSelected({ ...selected, nombre: e.target.value })} />
          {modules.map((modulo) => <div className="perm-row" key={modulo}><strong>{modulo}</strong>{ACTIONS.map((accion) => {
            const key = `${modulo}:${accion}`;
            return <label key={key}><input type="checkbox" checked={(selected.permisos || []).includes(key)} onChange={() => toggle(key)} />{accion}</label>;
          })}</div>)}
          <button onClick={save}>Guardar rol</button>
        </div>}
      </div>
    </div>
  );
}

function ImportLogPanel({ token }) {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({ fechaDesde: "", fechaHasta: "", producto: "" });
  async function load() {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
    const data = await api(token, `/importaciones/bitacora?${query}`);
    setLogs(data.logs);
  }
  useEffect(() => { load(); }, []);
  return (
    <div className="panel">
      <h2>Bitacora de importaciones</h2>
      <div className="filters">
        <input type="date" value={filters.fechaDesde} onChange={(e) => setFilters({ ...filters, fechaDesde: e.target.value })} />
        <input type="date" value={filters.fechaHasta} onChange={(e) => setFilters({ ...filters, fechaHasta: e.target.value })} />
        <input placeholder="Producto" value={filters.producto} onChange={(e) => setFilters({ ...filters, producto: e.target.value })} />
        <button onClick={load}>Filtrar</button>
      </div>
      <div className="table">{logs.map((log) => <div className="row" key={log.id}><div><strong>{log.producto_nombre}</strong><span>{log.archivo_origen} - {log.usuario_admin}</span></div><span>{log.tipo_cambio}</span><span>{log.fecha_hora}</span></div>)}</div>
    </div>
  );
}

function TransactionsList({ token }) {
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({ fechaDesde: "", fechaHasta: "", producto: "" });
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  async function load(isAppend = false) {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    query.set("limit", 50);
    query.set("offset", isAppend ? page * 50 : 0);

    try {
      const data = await api(token, `/transacciones?${query.toString()}`);
      if (isAppend) {
        setTransactions(prev => [...prev, ...data.transactions]);
      } else {
        setTransactions(data.transactions);
      }
      setHasMore(data.transactions.length === 50);
      if (!isAppend) setPage(1);
      else setPage(p => p + 1);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => { load(); }, []);

  // Agrupacion Año -> Mes -> Día
  const grouped = useMemo(() => {
    const map = {};
    for (const t of transactions) {
      const d = new Date(t.fecha);
      const year = d.getFullYear();
      const month = d.toLocaleString('es-ES', { month: 'long' });
      const day = d.getDate();
      const dateKey = `${day} de ${month}`;

      if (!map[year]) map[year] = {};
      if (!map[year][month]) map[year][month] = {};
      if (!map[year][month][dateKey]) map[year][month][dateKey] = [];

      map[year][month][dateKey].push(t);
    }
    return map;
  }, [transactions]);

  return (
    <div className="transactions-list">
      <div className="filters" style={{ margin: "20px 0", background: "#f8fafc", padding: "12px", borderRadius: "8px" }}>
        <input type="date" value={filters.fechaDesde} onChange={(e) => setFilters({ ...filters, fechaDesde: e.target.value })} title="Fecha desde" />
        <input type="date" value={filters.fechaHasta} onChange={(e) => setFilters({ ...filters, fechaHasta: e.target.value })} title="Fecha hasta" />
        <input placeholder="Buscar producto..." value={filters.producto} onChange={(e) => setFilters({ ...filters, producto: e.target.value })} />
        <button onClick={() => load(false)}>Filtrar</button>
      </div>

      <div className="timeline">
        {Object.keys(grouped).sort((a, b) => b - a).map(year => (
          <div key={year} className="tl-year">
            <h3 style={{ fontSize: "1.2rem", margin: "16px 0 8px", color: "#0f172a" }}>{year}</h3>
            {Object.keys(grouped[year]).map(month => (
              <div key={month} className="tl-month" style={{ paddingLeft: "12px" }}>
                <h4 style={{ textTransform: "capitalize", color: "#334155", margin: "12px 0 8px" }}>{month}</h4>
                {Object.keys(grouped[year][month]).map(dateKey => (
                  <div key={dateKey} className="tl-day" style={{ paddingLeft: "12px" }}>
                    <strong style={{ display: "block", marginBottom: "8px", color: "#64748b", fontSize: "0.9rem" }}>{dateKey}</strong>
                    <div className="table" style={{ marginBottom: "16px" }}>
                      {grouped[year][month][dateKey].map(t => (
                        <div className="row" key={t.id} style={{ display: "grid", gridTemplateColumns: "70px 80px 1fr 90px auto", background: "#fff", padding: "8px 12px" }}>
                          <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>{t.fecha.split(" ")[1]}</span>
                          <span className={`badge ${t.tipo}`}>{t.tipo}</span>
                          <div><strong>{t.producto_nombre}</strong><span style={{ fontSize: "0.85rem", color: "#64748b", display: "block" }}>Por: {t.usuario_nombre} {t.nota ? `- ${t.nota}` : ""}</span></div>
                          <span className="stock-col" style={{ fontWeight: "bold" }}>{t.cantidad} uds</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
        {transactions.length === 0 && <p className="muted">No hay transacciones para mostrar.</p>}
        {hasMore && transactions.length > 0 && (
          <button className="link-button" onClick={() => load(true)} style={{ width: "100%", padding: "12px", background: "#f1f5f9" }}>Cargar más transacciones</button>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>);
