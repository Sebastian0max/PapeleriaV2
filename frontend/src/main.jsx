import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Boxes,
  Download,
  FileText,
  LogOut,
  Moon,
  PackagePlus,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  Trash2,
  TrendingUp,
  Upload,
  Users,
  RotateCcw,
  Clock,
  AlertTriangle
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
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

async function downloadExcel(token, path, filename, onError) {
  try {
    const base = API_URL.replace(/\/+$/, '');
    const res = await fetch(`${base}${normalizePath(path)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Error del servidor (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    if (onError) onError(err.message);
    else alert("Error al exportar: " + err.message);
  }
}
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
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(t => t === "dark" ? "light" : "dark");
  }

  if (!session) return <Login onLogin={setSession} />;
  return <Dashboard session={session} onLogout={() => { setSession(null); }} theme={theme} toggleTheme={toggleTheme} />;
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
        <label>Usuario<input name="usuario" placeholder="admin" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus /></label>
        <label>Password<input name="password" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
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

function RevertModal({ isOpen, transaccion, onConfirm, onCancel }) {
  const [password, setPassword] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const esRestaurar = transaccion?.revertida;

  async function handleConfirm() {
    if (!password) {
      setError("Debes ingresar la contraseña del administrador.");
      return;
    }
    setBusy(true);
    setError("");
    const ok = await onConfirm(transaccion.id, password, motivo, esRestaurar);
    if (ok) {
      setPassword("");
      setMotivo("");
    } else {
      setError("Contraseña incorrecta. Intenta de nuevo.");
    }
    setBusy(false);
  }

  const tipoLabel = { venta: "venta", entrada: "entrada", salida: "salida", ajuste: "ajuste" }[transaccion?.tipo] || "transaccion";

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{esRestaurar ? "Restaurar" : "Revertir"} {tipoLabel}</h3>
        <p style={{ whiteSpace: "pre-line", margin: "16px 0" }}>
          Producto: {transaccion?.producto_nombre}{"\n"}
          Cantidad: {transaccion?.cantidad} uds{"\n"}
          Tipo: {transaccion?.tipo}{"\n"}
          Fecha: {transaccion?.fecha}
        </p>
        {error && <p className="error" style={{ margin: "8px 0" }}>{error}</p>}
        <label>
          Motivo (opcional)
          <input name="motivo" placeholder="Ej: Se registró la cantidad equivocada" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <label style={{ marginTop: "8px" }}>
          Contraseña de administrador
          <input name="password_confirm" type="password" placeholder="Ingresa tu contraseña" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        <div className="modal-actions" style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
          <button className="danger" onClick={handleConfirm} disabled={busy}>{busy ? (esRestaurar ? "Restaurando..." : "Revertindo...") : (esRestaurar ? "Confirmar restauración" : "Confirmar reversión")}</button>
          <button onClick={() => { setPassword(""); setMotivo(""); setError(""); onCancel(); }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ session, onLogout, theme, toggleTheme }) {
  const token = session.token;
  const permissions = session.user.permisos || [];
  const can = (key) => session.user.rol === "admin" || permissions.includes(key);
  const canAdmin = (key) => session.user.rol === "admin" && can(key);
  const [view, setView] = useState("inventario");
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [report, setReport] = useState(null);
  const [profitToday, setProfitToday] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saleToDelete, setSaleToDelete] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [revertTarget, setRevertTarget] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showExportMenu, setShowExportMenu] = useState(false);
  function toggleExportMenu() { setShowExportMenu(s => !s); }

  useEffect(() => {
    if (!showExportMenu) return;
    function close(e) { if (!e.target.closest('.export-dropdown')) setShowExportMenu(false); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showExportMenu]);

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

  async function confirmRevert(movimientoId, password, motivo, esRestaurar) {
    try {
      const endpoint = esRestaurar ? `/transacciones/${movimientoId}/restaurar` : `/transacciones/${movimientoId}/revertir`;
      const result = await api(token, endpoint, {
        method: "POST",
        body: JSON.stringify({ password, motivo: motivo || undefined })
      });
      setMessage(result.message || (esRestaurar ? "Transaccion restaurada correctamente" : "Transaccion revertida correctamente"));
      setTimeout(() => setMessage(""), 5000);
      setRevertTarget(null);
      setReloadKey(k => k + 1);
      load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
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
      const results = await Promise.allSettled([
        can("productos:ver") ? api(token, `/productos?search=${encodeURIComponent(searchOverride)}`) : Promise.resolve(null),
        can("ventas:ver") ? api(token, "/ventas") : Promise.resolve(null),
        can("reportes:ver") ? api(token, "/reportes/stock") : Promise.resolve(null),
        can("reportes:ver") ? api(token, "/reportes/ganancias?periodo=dia") : Promise.resolve(null)
      ]);
      const [productResult, saleResult, reportResult, profitResult] = results;
      if (productResult.status === "fulfilled" && productResult.value?.products) setProducts(productResult.value.products);
      if (saleResult.status === "fulfilled" && saleResult.value?.sales) setSales(saleResult.value.sales);
      if (reportResult.status === "fulfilled" && reportResult.value) setReport(reportResult.value);
      if (profitResult.status === "fulfilled" && profitResult.value) setProfitToday(profitResult.value);
      const errors = results.filter(r => r.status === "rejected").map(r => r.reason?.message).filter(Boolean);
      if (errors.length) setError(errors.join("; "));
      else setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [search]);
  useEffect(() => { if (view !== "config") load(); }, [reloadKey]);

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
          {can("reportes:ver") && <button className={view === "ganancias" ? "active" : ""} onClick={() => setView("ganancias")}><TrendingUp size={17} />Ganancias</button>}
          {showConfig && <button className={view === "config" ? "active" : ""} onClick={() => setView("config")}><Settings size={17} />Config</button>}
        </nav>
        <div className="header-actions">
          <div className="export-dropdown">
            <button className="icon-button" onClick={toggleExportMenu} title="Exportar datos"><Download size={18} /></button>
            {showExportMenu && (
              <div className="export-menu">
                <button onClick={() => { downloadExcel(token, "/exportar/productos", "productos.xlsx", setError); setShowExportMenu(false); }}><FileText size={14} /> Productos (Excel)</button>
                <button onClick={() => { downloadExcel(token, "/exportar/productos/pdf", "productos.pdf", setError); setShowExportMenu(false); }}><FileText size={14} /> Productos (PDF)</button>
                <button onClick={() => { downloadExcel(token, "/exportar/ventas", "ventas.xlsx", setError); setShowExportMenu(false); }}><FileText size={14} /> Ventas (Excel)</button>
                <button onClick={() => { downloadExcel(token, "/exportar/ventas/pdf", "ventas.pdf", setError); setShowExportMenu(false); }}><FileText size={14} /> Ventas (PDF)</button>
                <button onClick={() => { downloadExcel(token, "/exportar/ganancias", "ganancias.xlsx", setError); setShowExportMenu(false); }}><FileText size={14} /> Ganancias (Excel)</button>
                <button onClick={() => { downloadExcel(token, "/exportar/reportes", "reportes.xlsx", setError); setShowExportMenu(false); }}><FileText size={14} /> Reportes (Excel)</button>
              </div>
            )}
          </div>
          <button className="theme-toggle" onClick={toggleTheme} title={theme === "dark" ? "Modo claro" : "Modo oscuro"}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="icon-button" onClick={onLogout} title="Salir"><LogOut /></button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {message && <p className="success" style={{ margin: "0 0 20px" }}>{message}</p>}

      {view !== "config" && (
        <section className="metrics">
          <Metric icon={<Boxes />} label="Productos" value={products.length} />
          <Metric icon={<PackagePlus />} label="Unidades en stock" value={totalStock} />
          <Metric icon={<ShoppingCart />} label="Ventas recientes" value={sales.length} />
          {profitToday && <Metric icon={<TrendingUp />} label="Ganancia hoy" value={`$${profitToday.totalGanancia.toLocaleString()}`} />}
          {report?.agotados?.length > 0 && <Metric icon={<AlertTriangle />} label="Agotados" value={report.agotados.length} className="metric-warning" />}
          {report?.bajoStock?.length > 0 && <Metric icon={<AlertTriangle />} label="Stock bajo" value={report.bajoStock.length} className="metric-warning" />}
        </section>
      )}

      {view === "inventario" && (
        <section className="workspace">
          <div className="panel inventory-panel">
            <div className="panel-head">
              <h2>Productos</h2>
              <div className="search"><Search size={18} /><input name="search" placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
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
            <div className="panel-head">
              <h2>Vender</h2>
            </div>
            {can("ventas:crear") && <SaleForm token={token} products={products} onDone={load} />}
            <TransactionsList token={token} user={session.user} onRevert={setRevertTarget} canRevert={can("ventas:eliminar")} reloadKey={reloadKey} />
          </div>
          <div className="panel side-panel">
            <div className="panel-head">
              <h2>Reportes</h2>
            </div>
            <Report report={report} />
          </div>
        </section>
      )}

      {view === "ganancias" && <Ganancias token={token} />}

      {view === "config" && <Config token={token} can={can} onImported={async (msg) => {
        if (msg) { setMessage(msg); setTimeout(() => setMessage(""), 6000); }
        setSearch("");
        await load("");
        setReloadKey(k => k + 1);
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
      <RevertModal
        isOpen={!!revertTarget}
        transaccion={revertTarget}
        onConfirm={confirmRevert}
        onCancel={() => setRevertTarget(null)}
      />
    </main>
  );
}

function Metric({ icon, label, value, className }) {
  return <div className={"metric" + (className ? " " + className : "")}>{icon}<div><span>{label}</span><strong>{value}</strong></div></div>;
}

function ProductForm({ token, onDone }) {
  const empty = { nombre: "", cantidad_stock: "", precio: "", costo: "" };
  const [form, setForm] = useState(empty);
  async function submit(event) {
    event.preventDefault();
    const payload = {
      nombre: form.nombre,
      cantidad_stock: Number(form.cantidad_stock) || 0,
      precio: Number(form.precio) || 0,
      costo: Number(form.costo) || 0,
      stock_minimo: 0,
      codigo_barras: "",
      sku: "",
      categoria: ""
    };
    await api(token, "/productos", { method: "POST", body: JSON.stringify(payload) });
    setForm(empty);
    onDone();
  }

  return (
    <form className="product-form" onSubmit={submit}>
      <label>Nombre del producto<input name="nombre" required placeholder="Ej. Bolígrafo azul" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
      <label>Cantidad en stock<input name="cantidad_stock" required type="number" min="0" placeholder="0" value={form.cantidad_stock} onChange={(e) => setForm({ ...form, cantidad_stock: e.target.value })} /></label>
      <label>Precio de costo<input name="costo" type="number" min="0" placeholder="0" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} /></label>
      <label>Precio de venta<input name="precio" required type="number" min="0" placeholder="0" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} /></label>
      <button title="Agregar producto"><PackagePlus size={18} /></button>
      {Number(form.costo) > 0 && Number(form.precio) > 0 && Number(form.costo) >= Number(form.precio) && <span className="warning" style={{ gridColumn: "1 / -1", margin: 0 }}>⚠️ El precio de venta es menor o igual al costo. ¡Estás vendiendo a pérdida!</span>}
      {Number(form.costo) > 0 && Number(form.precio) > 0 && Number(form.costo) < Number(form.precio) && (Number(form.precio) - Number(form.costo)) / Number(form.precio) < 0.1 && <span className="warning" style={{ gridColumn: "1 / -1", margin: 0, background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}>⚠️ Margen menor al 10%. Considera aumentar el precio de venta.</span>}
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
      costo: product.costo ?? "",
      cantidad_stock: product.cantidad_stock
    });
    setIsEditing(true);
  }

  async function saveEdit() {
    try {
      const payload = {
        nombre: editForm.nombre,
        precio: Number(editForm.precio) || 0,
        costo: Number(editForm.costo) || 0,
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
      <div className="row product-row-edit">
        <div className="edit-fields">
          <label>Nombre<input name="edit-nombre" value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} /></label>
          <label>Stock<input name="edit-stock" type="number" min="0" value={editForm.cantidad_stock} onChange={(e) => setEditForm({ ...editForm, cantidad_stock: e.target.value })} /></label>
          <label>Costo<input name="edit-costo" type="number" min="0" value={editForm.costo} onChange={(e) => setEditForm({ ...editForm, costo: e.target.value })} /></label>
          <label>Venta<input name="edit-precio" type="number" min="0" value={editForm.precio} onChange={(e) => setEditForm({ ...editForm, precio: e.target.value })} /></label>
        </div>
        <div className="actions">
          <button onClick={saveEdit}>Guardar</button>
          <button className="danger" onClick={() => setIsEditing(false)}>Cancelar</button>
        </div>
      </div>
    );
  }

  const ganancia = product.precio - (product.costo ?? 0);
  const margen = product.precio > 0 ? (ganancia / product.precio * 100).toFixed(1) : 0;

  return (
    <div className="row product-row">
      <div className="product-title">
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
  const [productoId, setProductoId] = useState(0);
  const [cantidad, setCantidad] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const total = selectedProduct && cantidad > 0 ? selectedProduct.precio * cantidad : 0;

  useEffect(() => {
    const prod = products.find(p => p.id === productoId);
    setSelectedProduct(prod || null);
    setMessage("");
    setError("");
  }, [productoId, products]);

  async function submit(event) {
    event.preventDefault();
    if (!productoId) return;
    if (!selectedProduct) return;

    if (!selectedProduct.activo) {
      setError("No se pudo completar la venta: este producto ya no está disponible.");
      return;
    }

    if (!selectedProduct.precio || selectedProduct.precio <= 0) {
      setError("No se pudo completar la venta: el producto no tiene un precio válido configurado.");
      return;
    }

    if (!cantidad || cantidad <= 0) {
      setError("No se pudo completar la venta: la cantidad ingresada no es válida.");
      return;
    }

    if (cantidad > selectedProduct.cantidad_stock) {
      setError(`No se pudo completar la venta: solo hay ${selectedProduct.cantidad_stock} unidades disponibles de este producto.`);
      return;
    }

    setBusy(true);
    try {
      await api(token, "/ventas", { method: "POST", body: JSON.stringify({ productoId, cantidad }) });
      setMessage(`Venta exitosa: ${cantidad} unidades de ${selectedProduct.nombre} por $${total.toLocaleString()}`);
      setError("");
      setCantidad(1);
      setProductoId("");
      onDone();
    } catch (err) {
      setError(err.message || "No se pudo completar la venta: hubo un problema de conexión, intenta nuevamente.");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sale-form" onSubmit={submit}>
      {message && <div className="toast success">{message}</div>}
      {error && <div className="toast error">{error}</div>}
      <select name="producto_id" value={productoId} onChange={(e) => setProductoId(Number(e.target.value))}>
        <option value={0}>Producto</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.nombre}
          </option>
        ))}
      </select>
      {selectedProduct && (
        <div className="stock-info">
          <span><strong>Stock:</strong> {selectedProduct.cantidad_stock} uds</span>
          <span><strong>Precio:</strong> ${selectedProduct.precio.toLocaleString()} c/u</span>
        </div>
      )}
      <input name="cantidad" type="number" min="1" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
      <button title="Vender" disabled={busy}>
        <ShoppingCart size={18} />
      </button>
      {selectedProduct && cantidad > 0 && (
        <div className="stock-info total-display">
          Total a cobrar: <span>${total.toLocaleString()}</span>
        </div>
      )}
      {selectedProduct && (selectedProduct.costo ?? 0) > selectedProduct.precio && (
        <div className="sale-alert">
          ⚠️ Este producto se vende por debajo de su costo (${selectedProduct.costo.toLocaleString()})
        </div>
      )}
      {selectedProduct && (selectedProduct.costo ?? 0) > 0 && selectedProduct.costo <= selectedProduct.precio && (selectedProduct.precio - selectedProduct.costo) / selectedProduct.precio < 0.1 && (
        <div className="sale-alert">
          ⚠️ Margen bajo: {(100 * (selectedProduct.precio - selectedProduct.costo) / selectedProduct.precio).toFixed(1)}% de ganancia
        </div>
      )}
    </form>
  );
}

function Report({ report }) {
  if (!report) return null;
  return (
    <div className="report">
      <h3>Top del Dia</h3>
      {report.ventasDia.top.length === 0 ? <p className="muted">Sin ventas hoy</p> : report.ventasDia.top.map((p, i) => <div className="report-line" key={p.id}><span>{i + 1}. {p.nombre}</span><strong>{p.cantidad} uds</strong></div>)}
      <div className="report-line" style={{ borderTop: "1px solid var(--border)", paddingTop: "6px" }}><span>Total ingresos dia:</span><strong>${report.ventasDia.ingresos}</strong></div>

      <h3>Productos vendidos hoy</h3>
      {report.ventasDiaDetalle.length === 0 ? <p className="muted">Sin ventas hoy</p> : report.ventasDiaDetalle.map((p, i) => <div className="report-line" key={p.id}><span>{i + 1}. {p.nombre}</span><strong>{p.cantidad} uds</strong></div>)}

      <h3>Top de la Semana</h3>
      {report.ventasSemana.top.length === 0 ? <p className="muted">Sin ventas esta semana</p> : report.ventasSemana.top.map((p, i) => <div className="report-line" key={p.id}><span>{i + 1}. {p.nombre}</span><strong>{p.cantidad} uds</strong></div>)}
      <div className="report-line" style={{ borderTop: "1px solid var(--border)", paddingTop: "6px" }}><span>Total ingresos semana:</span><strong>${report.ventasSemana.ingresos}</strong></div>

      <h3>Top del Mes</h3>
      {report.ventasMes.top.length === 0 ? <p className="muted">Sin ventas este mes</p> : report.ventasMes.top.map((p, i) => <div className="report-line" key={p.id}><span>{i + 1}. {p.nombre}</span><strong>{p.cantidad} uds</strong></div>)}
      <div className="report-line" style={{ borderTop: "1px solid var(--border)", paddingTop: "6px" }}><span>Total ingresos mes:</span><strong>${report.ventasMes.ingresos}</strong></div>

      <h3>Menos vendidos (semana)</h3>
      {(report.menosVendidosSemana || []).length === 0 ? <p className="muted">Sin datos</p> : report.menosVendidosSemana.map((p, i) => <div className="report-line" key={p.id}><span>{i + 1}. {p.nombre}</span><strong>{p.vendidos} uds vendidos</strong></div>)}

      <h3>Menos vendidos (mes)</h3>
      {(report.menosVendidosMes || []).length === 0 ? <p className="muted">Sin datos</p> : report.menosVendidosMes.map((p, i) => <div className="report-line" key={p.id}><span>{i + 1}. {p.nombre}</span><strong>{p.vendidos} uds vendidos</strong></div>)}

      <h3>Productos con bajo stock</h3>
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
        {can("productos:eliminar") && <button className={section === "papelera" ? "active" : ""} onClick={() => setSection("papelera")}><Trash2 size={17} />Papelera</button>}
        <button onClick={() => window.open("/manual.html", "_blank")}><FileText size={17} />Manual</button>
      </aside>
      {section === "importacion" && <ImportPanel token={token} onImported={onImported} />}
      {section === "usuarios" && <UsersPanel token={token} />}
      {section === "roles" && <RolesPanel token={token} />}
      {section === "bitacora" && <ImportLogPanel token={token} />}
      {section === "papelera" && <TrashPanel token={token} />}
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
      setPreview(null);
      setFile(null);
      await onImported(`Importacion aplicada: ${data.result.created} creados, ${data.result.updated} actualizados, ${data.result.unchanged || 0} sin cambios.`);
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
        <input name="import-file" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
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
      <div className="preview-stats">
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
    if (!form.rol_id && roleData.roles?.[0]) setForm((x) => ({ ...x, rol_id: roleData.roles[0].id }));
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
        <input name="user-usuario" placeholder="Usuario" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
        <input name="user-password" placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select name="user-rol_id" value={form.rol_id} onChange={(e) => setForm({ ...form, rol_id: e.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.nombre}</option>)}</select>
        <button>Crear</button>
      </form>
      <div className="table">{users.map((user) => <div className="row" key={user.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", alignItems: "center" }}><div><strong>{user.usuario}</strong><span className="muted">{user.rol}</span></div><span>{user.activo ? "Activo" : "Inactivo"}</span><button className="danger" onClick={() => deactivate(user.id)}>Desactivar</button></div>)}</div>
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
    setSelected((current) => current || data.roles?.[0] || null);
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
          <input name="rol-nombre" value={selected.nombre} onChange={(e) => setSelected({ ...selected, nombre: e.target.value })} />
          {modules.map((modulo) => <div className="perm-row" key={modulo}><strong>{modulo}</strong>{ACTIONS.map((accion) => {
            const key = `${modulo}:${accion}`;
            return <label key={key}><input name={"perm-"+key} type="checkbox" checked={(selected.permisos || []).includes(key)} onChange={() => toggle(key)} />{accion}</label>;
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
        <input name="log-fecha_desde" type="date" value={filters.fechaDesde} onChange={(e) => setFilters({ ...filters, fechaDesde: e.target.value })} />
        <input name="log-fecha_hasta" type="date" value={filters.fechaHasta} onChange={(e) => setFilters({ ...filters, fechaHasta: e.target.value })} />
        <input name="log-producto" placeholder="Producto" value={filters.producto} onChange={(e) => setFilters({ ...filters, producto: e.target.value })} />
        <button onClick={load}>Filtrar</button>
      </div>
      <div className="table">{logs.map((log) => <div className="row" key={log.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 160px", alignItems: "center" }}><div><strong>{log.producto_nombre}</strong><span className="muted">{log.archivo_origen} - {log.usuario_admin}</span></div><span>{log.tipo_cambio}</span><span className="muted">{log.fecha_hora}</span></div>)}</div>
    </div>
  );
}

// Mapa de meses en español a número
const MONTH_MAP = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

function sortDays(monthObj) {
  const keys = Object.keys(monthObj);
  keys.sort((a, b) => {
    const dayA = parseInt(a, 10);
    const dayB = parseInt(b, 10);
    return dayB - dayA;
  });
  return keys;
}

function sortMonths(yearObj) {
  const keys = Object.keys(yearObj);
  keys.sort((a, b) => (MONTH_MAP[b] || 0) - (MONTH_MAP[a] || 0));
  return keys;
}

function TransactionsList({ token, user, onRevert, canRevert, reloadKey }) {
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({ fechaDesde: "", fechaHasta: "", producto: "" });
  const [tipoFilter, setTipoFilter] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

    async function load(isAppend = false) {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      if (tipoFilter === "revertida") {
        query.set("revertida", "1");
      } else if (tipoFilter) {
        query.set("tipo", tipoFilter);
        query.set("revertida", "0");
      } else {
        query.set("revertida", "0");
      }
    query.set("limit", 50);
    query.set("offset", isAppend ? page * 50 : 0);

    try {
      const data = await api(token, `/transacciones?${query.toString()}`);
      const txns = data.transactions || data;
      if (isAppend) {
        setTransactions(prev => [...prev, ...txns]);
      } else {
        setTransactions(txns);
      }
      setHasMore(txns.length === 50);
      if (!isAppend) setPage(1);
      else setPage(p => p + 1);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => { load(); }, [tipoFilter, reloadKey]);

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
    // Sort: non-reverted first within each day group
    for (const year of Object.keys(map)) {
      for (const month of Object.keys(map[year])) {
        for (const dateKey of Object.keys(map[year][month])) {
          map[year][month][dateKey].sort((a, b) => {
            if (a.revertida && !b.revertida) return 1;
            if (!a.revertida && b.revertida) return -1;
            return 0;
          });
        }
      }
    }
    return map;
  }, [transactions]);

  const TIPOS = [
    { value: "", label: "Todas", color: "#64748b" },
    { value: "venta", label: "Ventas", color: "#1e3a8a" },
    { value: "entrada", label: "Entradas", color: "#166534" },
    { value: "salida", label: "Salidas", color: "#991b1b" },
    { value: "ajuste", label: "Ajustes", color: "#92400e" },
    { value: "revertida", label: "Canceladas", color: "#64748b" }
  ];

  return (
    <div className="transactions-list">
      <div className="transactions-filters">
        <input name="tx-fecha_desde" type="date" value={filters.fechaDesde} onChange={(e) => setFilters({ ...filters, fechaDesde: e.target.value })} title="Fecha desde" />
        <input name="tx-fecha_hasta" type="date" value={filters.fechaHasta} onChange={(e) => setFilters({ ...filters, fechaHasta: e.target.value })} title="Fecha hasta" />
        <input name="tx-producto" placeholder="Buscar producto..." value={filters.producto} onChange={(e) => setFilters({ ...filters, producto: e.target.value })} />
        <button onClick={() => load(false)}>Filtrar</button>
      </div>

      <div className="tipo-tabs">
        {TIPOS.map(t => (
          <button
            key={t.value}
            className={`tipo-tab ${tipoFilter === t.value ? "active" : ""}`}
            onClick={() => setTipoFilter(t.value)}
          >{t.label}</button>
        ))}
      </div>

      <div className="timeline">
                  {Object.keys(grouped).sort((a, b) => b - a).map(year => (
          <div key={year} className="tl-year">
            <h3>{year}</h3>
            {sortMonths(grouped[year]).map(month => (
              <div key={month} className="tl-month">
                <h4>{month}</h4>
                {sortDays(grouped[year][month]).map(dateKey => (
                  <div key={dateKey} className="tl-day">
                    <strong>{dateKey}</strong>
                    <div className="table">
                      {grouped[year][month][dateKey].map(t => (
                        <div className="row transaction-row-content" key={t.id} data-revertida={t.revertida}>
                          <span className="muted">{t.fecha.split(" ")[1]}</span>
                          <span className={`badge ${t.tipo}`}>{t.tipo}</span>
                          <div>
                            <strong>{t.producto_nombre}</strong>
                            <span className="trash-meta">
                              Por: {t.usuario_nombre} {t.nota ? `- ${t.nota}` : ""}
                              {t.revertida && <span className="error"> (REVERTIDA{t.revertida_por_usuario ? ` por ${t.revertida_por_usuario}` : ""}{t.motivo_reversion ? `: ${t.motivo_reversion}` : ""})</span>}
                            </span>
                          </div>
                          <span className="stock-col">{t.cantidad} uds</span>
                          {canRevert && (
                            <button className={"danger revert-btn" + (t.revertida ? " restore-btn" : "")} onClick={() => onRevert(t)} title={t.revertida ? "Restaurar transaccion" : "Revertir transaccion"}>{t.revertida ? "Restaurar" : "Revertir"}</button>
                          )}
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
          <button className="load-more-btn" onClick={() => load(true)}>Cargar más transacciones</button>
        )}
      </div>
    </div>
  );
}

function TrashPanel({ token }) {
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const data = await api(token, "/productos/papelera");
      setProducts(data.products || []);
    } catch (err) {
      setMessage("Error al cargar papelera: " + err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function restore(id) {
    try {
      await api(token, `/productos/${id}/restaurar`, { method: "POST" });
      setMessage("Producto restaurado correctamente.");
      load();
    } catch (err) {
      setMessage("Error al restaurar: " + err.message);
    }
  }

  async function purgeAll() {
    if (!confirm("¿Eliminar fisicamente todos los productos en la papelera con mas de 7 dias?")) return;
    try {
      const result = await api(token, "/productos/purgar", { method: "POST" });
      setMessage(`Papelera purgada: ${result.purged} productos eliminados.`);
      load();
    } catch (err) {
      setMessage("Error al purgar: " + err.message);
    }
  }

  function daysRemaining(fecha) {
    if (!fecha) return "-";
    const eliminado = new Date(fecha);
    const now = new Date();
    const diff = 7 - Math.floor((now - eliminado) / (1000 * 60 * 60 * 24));
    return diff > 0 ? `${diff} dia(s)` : "Vence hoy";
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Papelera</h2>
        <button className="danger" onClick={purgeAll}><Trash2 size={16} />Purgar antiguos</button>
      </div>
      {message && <p className="success">{message}</p>}
      {products.length === 0 ? (
        <p className="muted">La papelera esta vacia.</p>
      ) : (
        <div className="table">
          {products.map((p) => (
            <div className="row trash-row" key={p.id}>
              <div>
                <strong>{p.nombre}</strong>
                <span className="trash-meta">
                  Eliminado por: {p.eliminado_por_usuario || "Desconocido"} - {p.fecha_eliminacion ? new Date(p.fecha_eliminacion).toLocaleString("es-ES") : ""}
                </span>
              </div>
              <span className="stock-col">{p.cantidad_stock} uds</span>
              <span className="trash-timer"><Clock size={14} />{daysRemaining(p.fecha_eliminacion)}</span>
              <div className="actions">
                <button onClick={() => restore(p.id)} title="Restaurar"><RotateCcw size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Ganancias({ token }) {
  const [data, setData] = useState({ products: [], totalGanancia: 0, totalIngresos: 0 });
  const [evolution, setEvolution] = useState([]);
  const [periodo, setPeriodo] = useState("mes");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [res, evo] = await Promise.all([
        api(token, `/reportes/ganancias?periodo=${periodo}`),
        api(token, "/reportes/ganancias/evolucion")
      ]);
      setData(res);
      setEvolution(evo);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [periodo]);

  const periodos = [
    { value: "dia", label: "Hoy" },
    { value: "semana", label: "Semana" },
    { value: "mes", label: "Mes" }
  ];

  const perdidaCls = "col-perdida";
  const margenBajoCls = "col-margen-bajo";

  return (
    <section className="panel ganancias-section">
      <div className="panel-head">
        <h2>Ganancias por producto</h2>
        <div className="period-filters">
          {periodos.map(p => (
            <button key={p.value} className={`period-btn${periodo === p.value ? " active" : ""}`}
              onClick={() => setPeriodo(p.value)}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {!loading && (
        <div className="metrics ganancias-metrics">
          <Metric icon={<TrendingUp />} label="Ganancia total" value={`$${data.totalGanancia.toLocaleString()}`} />
          <Metric icon={<ShoppingCart />} label="Ingresos totales" value={`$${data.totalIngresos.toLocaleString()}`} />
          <Metric icon={<Boxes />} label="Productos" value={data.products.length} />
        </div>
      )}

      {!loading && evolution.length > 0 && (
        <div className="chart-box">
          <h3>Evolución últimos 30 días</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={evolution} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "var(--text-secondary)" }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-secondary)" }} />
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} formatter={(v) => [`$${v.toLocaleString()}`, "Ganancia"]} labelFormatter={(l) => `Día: ${l}`} />
              <Bar dataKey="ganancia" fill="var(--accent)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {loading ? <p className="muted">Cargando...</p> : data.products.length === 0 ? <p className="muted">Sin datos en este periodo.</p> : (
        <div className="table">
          <div className="profit-header">
            <span>Producto</span>
            <span className="stock-col">Costo</span>
            <span className="stock-col">Venta</span>
            <span className="stock-col">Ganancia/unidad</span>
            <span className="stock-col">Margen</span>
            <span className="stock-col">Ganancia total</span>
          </div>
          {data.products.map(p => {
            const sinCosto = !p.costo || p.costo <= 0;
            const perdida = p.costo > p.precio;
            return (
              <div className="row profit-row" key={p.id}>
                <div>
                  <strong>{p.nombre}</strong>
                  {sinCosto && <span className="sin-costo">Sin costo registrado</span>}
                </div>
                <span className="stock-col">${(p.costo || 0).toLocaleString()}</span>
                <span className="stock-col">${p.precio.toLocaleString()}</span>
                <span className={`stock-col ${perdida ? perdidaCls : ""}`}>
                  {perdida ? "-" : "+"}${Math.abs(p.ganancia_unitaria).toLocaleString()}
                </span>
                <span className={`stock-col ${perdida ? perdidaCls : p.margen < 10 ? margenBajoCls : ""}`}>
                  {p.margen}%
                </span>
                <span className="stock-col col-ganancia-total">
                  ${p.ganancia_total.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>);
