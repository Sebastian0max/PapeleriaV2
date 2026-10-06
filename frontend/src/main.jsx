import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Boxes,
  Bell,
  Download,
  FileText,
  Loader2,
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
  const [slowServer, setSlowServer] = useState(false);

  const [loading, setLoading] = useState(false);
  const lockRef = useRef(false);
  const slowTimer = useRef(null);

  // El backend gratuito (Render) se duerme tras ~15 min sin uso y tarda
  // ~30s en despertar. Esta petición lo pre-calienta mientras el usuario
  // escribe sus credenciales, sin costo y sin cambiar nada del servidor.
  useEffect(() => {
    fetch(`${API_URL.replace(/\/+$/, "")}/health`).catch(() => {});
    return () => { if (slowTimer.current) clearTimeout(slowTimer.current); };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (loading || lockRef.current) return;
    lockRef.current = true;
    setError("");
    setLoading(true);
    setSlowServer(false);
    slowTimer.current = setTimeout(() => setSlowServer(true), 4000);
    try {
      const data = await api(null, "/auth/login", {
        method: "POST",
        body: JSON.stringify({ usuario, password })
      });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      if (slowTimer.current) clearTimeout(slowTimer.current);
      setSlowServer(false);
      setLoading(false);
      lockRef.current = false;
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
        <button disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
        {loading && slowServer && <p className="muted">Conectando con el servidor, puede tardar unos segundos la primera vez…</p>}
      </form>
    </main>
  );
}

function ConfirmModal({ isOpen, title, content, onConfirm, onCancel, busy }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{title}</h3>
        <p style={{ whiteSpace: "pre-line", margin: "16px 0" }}>{content}</p>
        <div className="modal-actions" style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button className="danger" onClick={onConfirm} disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : null}Si, eliminar</button>
          <button onClick={onCancel} disabled={busy}>Cancelar</button>
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
    const result = await onConfirm(transaccion.id, password, motivo, esRestaurar);
    if (result.ok) {
      setPassword("");
      setMotivo("");
    } else {
      setError(result.error || "No se pudo completar la operación. Verifica la contraseña e intenta de nuevo.");
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

const VIEW_TITLES = {
  inventario: "Inventario",
  vender: "Vender",
  transacciones: "Transacciones",
  ventas: "Transacciones",
  ganancias: "Ganancias",
  config: "Configuración"
};

function Dashboard({ session, onLogout, theme, toggleTheme }) {
  const token = session.token;
  const permissions = session.user.permisos || [];
  const can = useCallback((key) => session.user.rol === "admin" || permissions.includes(key), [permissions, session]);
  const canAdmin = useCallback((key) => session.user.rol === "admin" && can(key), [can, session]);
  const [view, setView] = useState("inventario");
  // Migración v2: la vista legacy "ventas" ahora es "transacciones"
  useEffect(() => { if (view === "ventas") setView("transacciones"); }, [view]);
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
  const [isLoading, setIsLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(() => localStorage.getItem("alertsEnabled") !== "0");
  useEffect(() => { localStorage.setItem("alertsEnabled", alertsEnabled ? "1" : "0"); }, [alertsEnabled]);

  const viewRef = useRef(view);
  viewRef.current = view;
  const searchRef = useRef(search);
  searchRef.current = search;

  const notify = useCallback((m) => { setMessage(m); setTimeout(() => setMessage(""), 5000); }, []);

  useEffect(() => {
    if (!showAlerts) return;
    function close(e) { if (!e.target.closest('.alerts-dropdown')) setShowAlerts(false); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showAlerts]);

  async function confirmDeleteSale() {
    if (!saleToDelete) return;
    setDeleting(true);
    try {
      const result = await api(token, `/ventas/${saleToDelete.id}`, { method: "DELETE" });
      setMessage(result.message || "Venta eliminada");
      setTimeout(() => setMessage(""), 5000);
      setReloadKey(k => k + 1);
    } catch (err) {
      setError(err.message);
    }
    setDeleting(false);
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
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function confirmDeleteProduct() {
    if (!productToDelete) return;
    setDeleting(true);
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
    setDeleting(false);
    setProductToDelete(null);
  }

  const load = useCallback(async (searchOverride) => {
    setIsLoading(true);
    try {
      const currentSearch = searchOverride !== undefined ? searchOverride : searchRef.current;
      const results = await Promise.allSettled([
        can("productos:ver") ? api(token, `/productos?search=${encodeURIComponent(currentSearch)}`) : Promise.resolve(null),
        can("ventas:ver") ? api(token, "/ventas") : Promise.resolve(null),
        can("reportes:ver") ? api(token, "/reportes/stock") : Promise.resolve(null),
        can("reportes:ver") && viewRef.current !== "ganancias" ? api(token, "/reportes/ganancias?periodo=dia") : Promise.resolve(null)
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
  }, [token, can]);

  useEffect(() => {
    if (!search) { load(""); return; }
    const t = setTimeout(() => { setIsLoading(true); load(search); }, 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { if (reloadKey > 0) load(); }, [reloadKey]);

  const totalStock = useMemo(() => products.reduce((sum, item) => sum + item.cantidad_stock, 0), [products]);
  const showConfig = session.user.rol === "admin" && can("configuracion:ver");

  const alertCount = alertsEnabled ? ((report?.agotados?.length || 0) + (report?.bajoStock?.length || 0)) : 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">P</span>
          <h1>Papelería</h1>
          <span className="brand-user">{session.user.usuario} · {session.user.rol}</span>
        </div>
        <div className="header-actions">
          <div className="alerts-dropdown">
            <button className="icon-button alerts-btn" onClick={() => setShowAlerts(s => !s)} title="Avisos de stock" aria-label="Avisos">
              <Bell size={18} />
              {alertCount > 0 && <span className="alert-badge">{alertCount > 99 ? "99+" : alertCount}</span>}
            </button>
            {showAlerts && (
              <div className="alerts-menu" role="dialog" aria-label="Avisos de stock">
                <strong className="alerts-title">Avisos de stock</strong>
                {!alertsEnabled && <p className="muted">Avisos silenciados (actívalos en Configuración → Preferencias).</p>}
                {alertsEnabled && alertCount === 0 && <p className="muted">Sin alertas. Todo el stock está bien.</p>}
                {alertsEnabled && (report?.agotados || []).slice(0, 4).map(p => (
                  <button key={"a" + p.id} className="alert-row" onClick={() => { setSearch(p.nombre); setView("inventario"); setShowAlerts(false); }}>
                    <span className="dot dot-out" />{p.nombre}<em>agotado</em>
                  </button>
                ))}
                {alertsEnabled && (report?.bajoStock || []).slice(0, 4).map(p => (
                  <button key={"b" + p.id} className="alert-row" onClick={() => { setSearch(p.nombre); setView("inventario"); setShowAlerts(false); }}>
                    <span className="dot dot-low" />{p.nombre}<em>{p.cantidad_stock} uds</em>
                  </button>
                ))}
              </div>
            )}
          </div>
          {showConfig && <button className="icon-button" onClick={() => setView("config")} title="Configuración" aria-label="Configuración"><Settings size={18} /></button>}
          <button className="icon-button" onClick={onLogout} title="Salir" aria-label="Salir"><LogOut size={18} /></button>
        </div>
      </header>
      <nav className="tabs" aria-label="Navegación principal">
        <button className={view === "inventario" ? "active" : ""} onClick={() => setView("inventario")}><Boxes size={17} />Inventario</button>
        <button className={view === "vender" ? "active" : ""} onClick={() => setView("vender")}><ShoppingCart size={17} />Vender</button>
        <button className={(view === "transacciones" || view === "ventas") ? "active" : ""} onClick={() => setView("transacciones")}><Clock size={17} />Transacciones</button>
        {can("reportes:ver") && <button className={view === "ganancias" ? "active" : ""} onClick={() => setView("ganancias")}><TrendingUp size={17} />Ganancias</button>}
      </nav>

      {error && <p className="error">{error}</p>}
      {message && <p className="success" style={{ margin: "0 0 20px" }}>{message}</p>}

      {view === "inventario" && (
        <InventarioView
          products={products}
          search={search}
          setSearch={setSearch}
          isLoading={isLoading}
          canAdmin={canAdmin}
          token={token}
          notify={notify}
          onProductCreated={() => { setMessage("Producto creado con exito"); setTimeout(() => setMessage(""), 3000); load(); }}
          onDone={load}
          setProductToDelete={setProductToDelete}
          profitToday={profitToday}
        />
      )}

      {view === "vender" && (
        <VenderView token={token} products={products} sales={sales} canCrear={can("ventas:crear")} onDone={() => setReloadKey(k => k + 1)} />
      )}

      {(view === "transacciones" || view === "ventas") && (
        <TransaccionesView token={token} products={products} user={session.user} onRevert={setRevertTarget} canRevert={can("ventas:eliminar")} reloadKey={reloadKey} onExportError={setError} />
      )}

      {view === "ganancias" && <Ganancias token={token} onExportError={setError} />}

      {view === "config" && <Config token={token} can={can} user={session.user} theme={theme} toggleTheme={toggleTheme} alertsEnabled={alertsEnabled} setAlertsEnabled={setAlertsEnabled} onLogout={onLogout} onExportError={setError} onImported={(msg) => {
        if (msg) { setMessage(msg); setTimeout(() => setMessage(""), 6000); }
        setSearch("");
        setReloadKey(k => k + 1);
        setView("inventario");
      }} />}
      <ConfirmModal
        isOpen={!!saleToDelete}
        title="Eliminar Venta"
        content={saleToDelete ? `Producto: ${saleToDelete.producto_nombre}\nCantidad: ${saleToDelete.cantidad}\nTotal: $${saleToDelete.total}\nFecha: ${saleToDelete.fecha}\n\n¿Estas seguro de anular esta venta? El stock será devuelto al inventario.` : ""}
        onConfirm={confirmDeleteSale}
        onCancel={() => setSaleToDelete(null)}
        busy={deleting}
      />
      <ConfirmModal
        isOpen={!!productToDelete}
        title="Eliminar Producto"
        content={productToDelete ? `Producto: ${productToDelete.nombre}\nCantidad en stock: ${productToDelete.cantidad_stock}\n\n¿Estás seguro de eliminar este producto?` : ""}
        onConfirm={confirmDeleteProduct}
        onCancel={() => setProductToDelete(null)}
        busy={deleting}
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

function InventarioView({ products, search, setSearch, isLoading, canAdmin, token, notify, onProductCreated, onDone, setProductToDelete, profitToday }) {
  const [filter, setFilter] = useState('todos');
  const [detail, setDetail] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const disponibles = products.filter(p => (Number(p.cantidad_stock) || 0) > 0 && (Number(p.cantidad_stock) || 0) > (p.stock_minimo ?? 0)).length;
  const agotadosCount = products.filter(p => (Number(p.cantidad_stock) || 0) <= 0).length;
  const stockBajoCount = products.filter(p => {
    const s = Number(p.cantidad_stock) || 0; const m = p.stock_minimo ?? 0;
    return s > 0 && s <= m;
  }).length;

  const filtered = products.filter(p => {
    const s = Number(p.cantidad_stock) || 0; const m = p.stock_minimo ?? 0;
    const term = search.trim().toLowerCase();
    const matchTerm = !term || p.nombre?.toLowerCase().includes(term) || (p.categoria || '').toLowerCase().includes(term) || (p.codigo_barras || '').toLowerCase().includes(term) || String(p.id).includes(term);
    if (!matchTerm) return false;
    if (filter === 'disponibles') return s > 0 && s > m;
    if (filter === 'agotados') return s <= 0;
    if (filter === 'stock-bajo') return s > 0 && s <= m;
    return true;
  });

  function stockState(p) {
    const s = Number(p.cantidad_stock) || 0; const m = p.stock_minimo ?? 0;
    if (s <= 0) return { tag: 'agotado', dot: 'dot-out', cls: 'tag-out' };
    if (s <= m) return { tag: 'stock bajo', dot: 'dot-low', cls: 'tag-low' };
    return { tag: 'disponible', dot: 'dot-ok', cls: 'tag-ok' };
  }

  return (
    <section className="inv-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Inventario</h2>
          <p className="page-desc">Administra productos y stock. Selecciona un producto para ver su detalle.</p>
        </div>
        {canAdmin("productos:crear") && (
          <button className="btn-primary" onClick={() => setShowAdd(s => !s)}>+ Agregar producto</button>
        )}
      </div>
      {showAdd && canAdmin("productos:crear") && (
        <div className="add-wrap">
          <ProductForm token={token} onDone={() => { setShowAdd(false); onProductCreated(); }} />
        </div>
      )}
      <div className="summary-line">
            <span><span className="summary-strong">{products.length}</span> productos</span>
            <span className="summary-sep">·</span>
            <span><span className="summary-ok">{disponibles}</span> disponible{disponibles !== 1 ? 's' : ''}</span>
            <span className="summary-sep">·</span>
            <span><span className="summary-danger">{agotadosCount}</span> agotado{agotadosCount !== 1 ? 's' : ''}</span>
            <span className="summary-sep">·</span>
            <span><span className="summary-warn">{stockBajoCount}</span> stock bajo</span>
            <span className="summary-sep">·</span>
            <span>${(profitToday?.totalGanancia ?? 0).toLocaleString()} hoy</span>
          </div>
          <div className="toolbar">
            <div className="filter-pills">
              <button className={`pill ${filter==='todos'?'active':''}`} onClick={() => setFilter('todos')}>Todos</button>
              <button className={`pill ${filter==='disponibles'?'active':''}`} onClick={() => setFilter('disponibles')}>Disponibles</button>
              <button className={`pill ${filter==='agotados'?'active':''}`} onClick={() => setFilter('agotados')}>Agotados</button>
              <button className={`pill ${filter==='stock-bajo'?'active':''}`} onClick={() => setFilter('stock-bajo')}>Stock bajo</button>
            </div>
            <div className="search" style={{ marginLeft: 'auto' }}><Search size={18} /><input name="search" placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} />{isLoading && <span className="spinner" />}</div>
          </div>
          <div className="table-card">
            <div className="table-scroll">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Stock</th>
                    <th>Precio venta</th>
                    <th>⋮</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const st = stockState(p);
                    const isActive = (detail && String(detail.id) === String(p.id));
                    return (
                      <tr key={p.id} className={isActive ? 'active' : ''} onClick={(e) => { if (e.target.closest('.row-menu')) return; setDetail(p); }}>
                        <td>
                          <div className="cell-product">
                            <span className="name">{p.nombre}</span>
                            {(p.categoria || p.sku || p.codigo_barras) && <span className="cat">{p.categoria || ''}{(p.categoria && p.sku) ? ' • ' : ''}{p.sku || ''}{p.codigo_barras ? ' • ' + p.codigo_barras : ''}</span>}
                          </div>
                        </td>
                        <td>
                          <div className="stock-cell">
                            <span className={`dot ${st.dot}`}></span>
                            <span className="stock-num">{Number(p.cantidad_stock) || 0}</span>
                            <span className={`stock-tag ${st.cls}`}>{st.tag}</span>
                          </div>
                        </td>
                        <td><span className="price">${Number(p.precio).toLocaleString()}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="row-menu" onClick={(e) => { e.stopPropagation(); setDetail(p); }} title="Opciones">⋮</button>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Sin productos que coincidan con el filtro/búsqueda</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
      {detail && (
        <div className="drawer-root">
          <div className="drawer-backdrop" onClick={() => setDetail(null)} />
          <aside className="detail-panel drawer" role="dialog" aria-label="Detalle de producto">
            <div className="detail-head">
              <h3>{detail.nombre}</h3>
              <div className="spacer"></div>
              <button className="detail-close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="detail-sub">{detail.categoria || 'Sin categoría'}</div>
            <DetailPanel product={detail} token={token} onDone={() => { setDetail(null); onDone(); }} onMessage={notify} can={canAdmin} onDeleteRequest={setProductToDelete} />
          </aside>
        </div>
      )}
    </section>
  );
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
      <label>Stock<input name="cantidad_stock" required type="number" min="0" placeholder="0" value={form.cantidad_stock} onChange={(e) => setForm({ ...form, cantidad_stock: e.target.value })} /></label>
      <label>Precio de costo<input name="costo" type="number" min="0" placeholder="0" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} /></label>
      <label>Precio de venta<input name="precio" required type="number" min="0" placeholder="0" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} /></label>
      <button title="Agregar producto"><PackagePlus size={18} /></button>
      {Number(form.costo) > 0 && Number(form.precio) > 0 && Number(form.costo) >= Number(form.precio) && <span className="warning" style={{ gridColumn: "1 / -1", margin: 0 }}>⚠️ El precio de venta es menor o igual al costo. ¡Estás vendiendo a pérdida!</span>}
      {Number(form.costo) > 0 && Number(form.precio) > 0 && Number(form.costo) < Number(form.precio) && (Number(form.precio) - Number(form.costo)) / Number(form.precio) < 0.1 && <span className="warning" style={{ gridColumn: "1 / -1", margin: 0, background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}>⚠️ Margen menor al 10%. Considera aumentar el precio de venta.</span>}
    </form>
  );
}

const ProductRow = React.memo(function ProductRow({ product, token, onDone, onMessage, can, onDeleteRequest }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [busyAction, setBusyAction] = useState(null);

  async function move(tipo) {
    const input = prompt(`Cantidad para ${tipo}`, "1");
    if (input === null) return;
    const cantidad = Number(input);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      onMessage("La cantidad debe ser un número mayor a 0.");
      return;
    }
    if (tipo === "salida") {
      const stock = Number(product.cantidad_stock) || 0;
      if (stock <= 0) {
        onMessage(`"${product.nombre}" no tiene stock disponible (0 uds).`);
        return;
      }
      if (cantidad > stock) {
        onMessage(`No hay suficiente stock: solo hay ${stock} uds de "${product.nombre}".`);
        return;
      }
    }
    setBusyAction(tipo);
    try {
      await api(token, `/productos/${product.id}/movimientos`, {
        method: "POST",
        body: JSON.stringify({ tipo, cantidad })
      });
      await onDone();
    } catch (err) {
      onMessage("Error al mover stock: " + err.message);
    } finally {
      setBusyAction(null);
    }
  }

  function startEdit() {
    if (busyAction) return;
    setEditForm({
      nombre: product.nombre,
      precio: product.precio,
      costo: product.costo ?? "",
      cantidad_stock: product.cantidad_stock
    });
    setIsEditing(true);
    onMessage(`Modo edición activado para "${product.nombre}". Pulsa Guardar para confirmar.`);
  }

  async function saveEdit() {
    setBusyAction("guardar");
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
    } finally {
      setBusyAction(null);
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
          <button onClick={saveEdit} disabled={busyAction !== null}>{busyAction === "guardar" ? <Loader2 size={16} className="spin" /> : "Guardar"}</button>
          <button className="danger" onClick={() => setIsEditing(false)} disabled={busyAction !== null}>Cancelar</button>
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
        {can("stock:crear") && <button className="icon-only" onClick={() => move("entrada")} title="Añadir stock" disabled={busyAction !== null}>{busyAction === "entrada" ? <Loader2 size={16} className="spin" /> : "+"}</button>}
        {can("stock:crear") && <button className="icon-only" onClick={() => move("salida")} title="Restar stock" disabled={busyAction !== null}>{busyAction === "salida" ? <Loader2 size={16} className="spin" /> : "-"}</button>}
        {can("productos:editar") && <button onClick={startEdit} disabled={busyAction !== null}>Editar</button>}
        {can("productos:eliminar") && <button className="danger icon-only" onClick={() => onDeleteRequest(product)} title="Eliminar" disabled={busyAction !== null}><Trash2 size={16} /></button>}
      </div>
    </div>
  );
});

function DetailPanel({ product, token, onDone, onMessage, can, onDeleteRequest }) {
  const [stock, setStock] = useState(Number(product.cantidad_stock) || 0);
  const [costo, setCosto] = useState(product.costo ?? "");
  const [precio, setPrecio] = useState(product.precio ?? "");
  const [busy, setBusy] = useState(false);

  const costoN = Number(costo) || 0;
  const precioN = Number(precio) || 0;
  const ganancia = precioN - costoN;
  const margenPct = precioN > 0 ? (ganancia / precioN) * 100 : 0;

  async function guardar() {
    setBusy(true);
    try {
      const payload = {
        nombre: product.nombre,
        precio: Number(precio) || 0,
        costo: Number(costo) || 0,
        cantidad_stock: Number(stock) || 0
      };
      await api(token, `/productos/${product.id}`, { method: "PUT", body: JSON.stringify(payload) });
      onMessage(`Producto "${product.nombre}" actualizado.`);
      onDone();
    } catch (err) {
      alert("Error al guardar: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="detail-field">
        <label>Stock actual</label>
        <div className="stepper">
          <button type="button" onClick={() => setStock(Math.max(0, stock - 1))} disabled={busy}>−</button>
          <span className="val">{stock}</span>
          <button type="button" onClick={() => setStock(stock + 1)} disabled={busy}>+</button>
          <span className="badge">uds</span>
        </div>
      </div>
      <div className="field-price">
        <div className="detail-field">
          <label>Precio costo</label>
          <input className="price-input" type="number" min="0" value={costo} onChange={(e) => setCosto(e.target.value)} disabled={busy} />
        </div>
        <div className="detail-field">
          <label>Precio venta</label>
          <input className="price-input" type="number" min="0" value={precio} onChange={(e) => setPrecio(e.target.value)} disabled={busy} />
        </div>
      </div>
      <div className={`margin-box ${margenPct < 0 ? 'neg' : ''}`}>
        <span className="m-label">Margen</span>
        <span className="m-value">{margenPct.toFixed(1)}%</span>
      </div>
      {margenPct >= 0 && margenPct < 10 && <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--stock-low-text)', marginTop: 'var(--space-2)' }}>Margen bajo: considerá un precio de venta mayor.</p>}
      <div className="detail-actions">
        <button className="btn-primary" onClick={guardar} disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : 'Guardar'}</button>
        {can("productos:eliminar") && <button className="btn-secondary" onClick={() => onDeleteRequest(product)} disabled={busy}>Eliminar</button>}
      </div>
    </div>
  );
}

function VenderView({ token, products, sales, canCrear, onDone }) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => { const m = {}; products.forEach(p => { m[String(p.id)] = p; }); return m; }, [products]);
  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    const list = products.filter(p => !t
      || p.nombre?.toLowerCase().includes(t)
      || (p.sku || "").toLowerCase().includes(t)
      || (p.codigo_barras || "").toLowerCase().includes(t)
      || (p.categoria || "").toLowerCase().includes(t));
    return list.slice(0, 40);
  }, [products, query]);

  function stockOf(p) { return Number(p.cantidad_stock) || 0; }
  function inCart(id) { const l = cart.find(x => String(x.id) === String(id)); return l ? l.cantidad : 0; }

  function add(p) {
    if (!canCrear || busy) return;
    const s = stockOf(p);
    if (s <= 0) { setError(`"${p.nombre}" está agotado.`); return; }
    if (inCart(p.id) + 1 > s) { setError(`Solo hay ${s} uds de "${p.nombre}".`); return; }
    setError("");
    setCart(prev => {
      const f = prev.find(x => String(x.id) === String(p.id));
      if (f) return prev.map(x => String(x.id) === String(p.id) ? { ...x, cantidad: x.cantidad + 1 } : x);
      return [...prev, { id: p.id, cantidad: 1 }];
    });
  }

  function setQty(id, qty) {
    const p = byId[String(id)];
    const s = p ? stockOf(p) : 99;
    const q = Math.max(0, Math.min(Number(qty) || 0, s));
    setCart(prev => q <= 0 ? prev.filter(x => String(x.id) !== String(id)) : prev.map(x => String(x.id) === String(id) ? { ...x, cantidad: q } : x));
  }

  const total = cart.reduce((sum, l) => { const p = byId[String(l.id)]; return sum + (p ? Number(p.precio) * l.cantidad : 0); }, 0);
  const uds = cart.reduce((sum, l) => sum + l.cantidad, 0);

  async function confirmar() {
    if (!canCrear || cart.length === 0 || busy) return;
    for (const l of cart) {
      const p = byId[String(l.id)];
      if (!p) { setError("Un producto del carrito ya no existe."); return; }
      if (p.activo === 0 || p.activo === false) { setError(`"${p.nombre}" ya no está disponible.`); return; }
      if (!p.precio || Number(p.precio) <= 0) { setError(`"${p.nombre}" no tiene un precio válido configurado.`); return; }
      if (l.cantidad > stockOf(p)) { setError(`Solo hay ${stockOf(p)} uds de "${p.nombre}".`); return; }
    }
    setBusy(true);
    setError("");
    try {
      let cobrado = 0, n = 0;
      for (const l of cart) {
        const p = byId[String(l.id)];
        await api(token, "/ventas", { method: "POST", body: JSON.stringify({ productoId: String(p.id), cantidad: l.cantidad, precio_unitario: p.precio }) });
        cobrado += Number(p.precio) * l.cantidad;
        n += l.cantidad;
      }
      setMessage(`Venta exitosa: ${n} uds por $${cobrado.toLocaleString()}`);
      setCart([]);
      setQuery("");
      onDone();
    } catch (err) {
      setError(err.message || "No se pudo completar la venta: hubo un problema de conexión, intenta nuevamente.");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  const recent = (sales || []).slice(0, 5);

  return (
    <section className="sell-page">
      <h2 className="page-title">Vender</h2>
      <p className="page-desc">Busca el producto, agrégalo al carrito, ajusta la cantidad y confirma.</p>
      {message && <div className="toast success">{message}</div>}
      {error && <div className="toast error">{error}</div>}
      <div className="sell-grid">
        <div className="sell-catalog">
          <div className="search sell-search"><Search size={18} /><input name="vender-buscar" placeholder="Buscar producto para vender…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <div className="sell-list">
            {filtered.map(p => {
              const s = stockOf(p);
              const agotado = s <= 0;
              return (
                <div className="sell-item" key={p.id}>
                  <div className="sell-item-info">
                    <strong>{p.nombre}</strong>
                    <span className="muted">${Number(p.precio).toLocaleString()} · {agotado ? "agotado" : `${s} disp.`}</span>
                  </div>
                  <button className="btn-ghost" disabled={!canCrear || agotado || busy} onClick={() => add(p)} title={agotado ? "Sin stock" : "Agregar al carrito"}>Agregar</button>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="muted">Sin productos que coincidan con la búsqueda.</p>}
          </div>
        </div>
        <aside className="cart" aria-label="Venta actual">
          <strong>Venta actual</strong>
          {cart.length === 0 && <p className="muted">El carrito está vacío. Agrega productos de la lista.</p>}
          {cart.map(l => {
            const p = byId[String(l.id)];
            if (!p) return null;
            return (
              <div className="cart-line" key={l.id}>
                <span className="cart-name"><strong>{p.nombre}</strong><small>${Number(p.precio).toLocaleString()} c/u · ${Number(p.precio * l.cantidad).toLocaleString()}</small></span>
                <span className="qty">
                  <button type="button" className="qty-btn" onClick={() => setQty(l.id, l.cantidad - 1)} disabled={busy} aria-label="Quitar uno">−</button>
                  <b>{l.cantidad}</b>
                  <button type="button" className="qty-btn" onClick={() => setQty(l.id, l.cantidad + 1)} disabled={busy} aria-label="Agregar uno">+</button>
                </span>
              </div>
            );
          })}
          <div className="cart-total"><span>Total{uds > 0 ? ` (${uds} uds)` : ""}</span><strong>${total.toLocaleString()}</strong></div>
          <button className="btn-primary confirm-btn" disabled={!canCrear || cart.length === 0 || busy} onClick={confirmar}>
            {busy ? <Loader2 size={18} className="spin" /> : <ShoppingCart size={18} />} {busy ? "Vendiendo…" : "Confirmar venta"}
          </button>
          {!canCrear && <p className="muted">No tienes permiso para crear ventas.</p>}
        </aside>
      </div>
      <h3 className="sub-title">Ventas recientes</h3>
      {recent.length === 0 ? <p className="muted">Aún no hay ventas recientes.</p> : (
        <div className="recent-list">
          {recent.map(s => (
            <div className="recent-row" key={s.id}>
              <span><strong>{s.producto_nombre}</strong> × {s.cantidad}</span>
              <span className="muted">{s.fecha}</span>
              <strong>${Number(s.total).toLocaleString()}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Report({ report }) {
  if (!report) return null;
  const RankBadge = ({ i }) => {
    const cls = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "rank-n";
    return <span className={`rank ${cls}`}>{i + 1}</span>;
  };
  const StockBar = ({ current, min }) => {
    const pct = min > 0 ? Math.round((current / min) * 100) : 0;
    const cls = pct === 0 ? "critical" : pct < 50 ? "warning" : "ok";
    return <div className="stock-bar"><div className={`stock-bar-fill ${cls}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>;
  };
  const renderTopList = (items, ingresos) => (
    <div className="report-section">
      {items.length === 0 ? <p className="muted">Sin ventas</p> : items.map((p, i) => (
        <div className="report-line" key={p.id}>
          <span><RankBadge i={i} />{p.nombre}</span>
          <strong>{p.cantidad} uds</strong>
        </div>
      ))}
      {ingresos != null && (
        <div className="report-revenue-total">
          <span>Total ingresos</span>
          <strong>${ingresos}</strong>
        </div>
      )}
    </div>
  );
  const renderStockRow = (p, showBar) => (
    <div className="stock-alert-row" key={p.id}>
      <span className="stock-label">{p.nombre}</span>
      {showBar && <StockBar current={p.cantidad_stock} min={p.stock_minimo || 1} />}
      <span className="stock-count">{p.cantidad_stock} uds</span>
    </div>
  );
  return (
    <div className="report">
      <div className="report-summary">
        <div className="report-summary-card">
          <span className="label">Hoy</span>
          <span className="value">${report.ventasDia.ingresos}</span>
        </div>
        <div className="report-summary-card">
          <span className="label">Semana</span>
          <span className="value">${report.ventasSemana.ingresos}</span>
        </div>
        <div className="report-summary-card">
          <span className="label">Mes</span>
          <span className="value">${report.ventasMes.ingresos}</span>
        </div>
      </div>

      <h3 style={{ margin: 0, fontSize: "var(--fs-sm)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)" }}>Top del Dia</h3>
      {renderTopList(report.ventasDia.top, report.ventasDia.ingresos)}

      <h3 style={{ margin: "var(--space-md) 0 var(--space-sm)", fontSize: "var(--fs-sm)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)" }}>Top de la Semana</h3>
      {renderTopList(report.ventasSemana.top, report.ventasSemana.ingresos)}

      <h3 style={{ margin: "var(--space-md) 0 var(--space-sm)", fontSize: "var(--fs-sm)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)" }}>Top del Mes</h3>
      {renderTopList(report.ventasMes.top, report.ventasMes.ingresos)}

      {report.menosVendidosSemana?.length > 0 && (
        <>
          <h3 style={{ margin: "var(--space-md) 0 var(--space-sm)", fontSize: "var(--fs-sm)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)" }}>Menos vendidos (semana)</h3>
          <div className="report-section">
            {report.menosVendidosSemana.map((p, i) => (
              <div className="report-line" key={p.id}>
                <span><RankBadge i={i} />{p.nombre}</span>
                <strong>{p.vendidos} uds</strong>
              </div>
            ))}
          </div>
        </>
      )}

      {report.menosVendidosMes?.length > 0 && (
        <>
          <h3 style={{ margin: "var(--space-md) 0 var(--space-sm)", fontSize: "var(--fs-sm)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)" }}>Menos vendidos (mes)</h3>
          <div className="report-section">
            {report.menosVendidosMes.map((p, i) => (
              <div className="report-line" key={p.id}>
                <span><RankBadge i={i} />{p.nombre}</span>
                <strong>{p.vendidos} uds</strong>
              </div>
            ))}
          </div>
        </>
      )}

      {(report.agotados?.length > 0 || report.bajoStock?.length > 0) && (
        <>
          <h3 style={{ margin: "var(--space-md) 0 var(--space-sm)", fontSize: "var(--fs-sm)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)" }}>Alertas de Stock</h3>
          <div className="report-section">
            {report.agotados?.map(p => renderStockRow(p, false))}
            {report.bajoStock?.map(p => renderStockRow(p, true))}
          </div>
        </>
      )}
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

function Config({ token, can, user, theme, toggleTheme, alertsEnabled, setAlertsEnabled, onLogout, onExportError, onImported }) {
  function dl(path, filename) { downloadExcel(token, path, filename, onExportError); }
  return (
    <section className="cfg-page">
      <h2 className="page-title">Configuración</h2>
      <p className="page-desc">Cuenta, preferencias y sistema en una sola lista.</p>
      <div className="cfg-list">
        <h3 className="cfg-sec">Cuenta</h3>
        <div className="cfg-row">
          <span><strong>{user?.usuario}</strong><small>Rol: {user?.rol}</small></span>
          <button className="btn-ghost" onClick={onLogout}>Cerrar sesión</button>
        </div>
        {can("usuarios:ver") && (
          <div className="cfg-block"><UsersPanel token={token} /></div>
        )}
        {can("roles:ver") && (
          <div className="cfg-block"><RolesPanel token={token} /></div>
        )}

        <h3 className="cfg-sec">Preferencias</h3>
        <div className="cfg-row">
          <span><strong>Tema</strong><small>Claro u oscuro</small></span>
          <span className="seg">
            <button className={theme !== "dark" ? "active" : ""} onClick={() => { if (theme === "dark") toggleTheme(); }}>Claro</button>
            <button className={theme === "dark" ? "active" : ""} onClick={() => { if (theme !== "dark") toggleTheme(); }}>Oscuro</button>
          </span>
        </div>
        <div className="cfg-row">
          <span><strong>Avisos de stock bajo</strong><small>Campana 🔔 del encabezado</small></span>
          <span className="seg">
            <button className={alertsEnabled ? "active" : ""} onClick={() => setAlertsEnabled(true)}>Activados</button>
            <button className={!alertsEnabled ? "active" : ""} onClick={() => setAlertsEnabled(false)}>Silenciados</button>
          </span>
        </div>

        <h3 className="cfg-sec">Sistema</h3>
        <div className="cfg-row">
          <span><strong>Exportar datos</strong><small>Productos, ventas, ganancias y reportes</small></span>
          <span className="cfg-exports">
            <button className="btn-ghost" onClick={() => dl("/exportar/productos", "productos.xlsx")}>Productos</button>
            <button className="btn-ghost" onClick={() => dl("/exportar/ventas", "ventas.xlsx")}>Ventas</button>
            <button className="btn-ghost" onClick={() => dl("/exportar/ganancias", "ganancias.xlsx")}>Ganancias</button>
            <button className="btn-ghost" onClick={() => dl("/exportar/reportes", "reportes.xlsx")}>Reportes</button>
          </span>
        </div>
        {can("importacion:ver") && (
          <div className="cfg-block"><ImportPanel token={token} onImported={onImported} /></div>
        )}
        {can("importacion:ver") && (
          <div className="cfg-block"><ImportLogPanel token={token} /></div>
        )}
        {can("productos:eliminar") && (
          <div className="cfg-block"><TrashPanel token={token} /></div>
        )}
        <div className="cfg-row">
          <span><strong>Manual de uso</strong><small>Guía rápida de la aplicación</small></span>
          <button className="btn-ghost" onClick={() => window.open("/manual.html", "_blank")}><FileText size={16} /> Abrir manual</button>
        </div>
      </div>
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
        <button disabled={busy || !file}>{busy ? <Loader2 size={17} className="spin" /> : <Upload size={17} />}{busy ? "Importando" : "Importar"}</button>
      </form>
      {message && <p className="success">{message}</p>}
      {preview && <ImportPreview preview={preview} onConfirm={confirmImport} busy={busy} />}
    </div>
  );
}

function ImportPreview({ preview, onConfirm, busy }) {
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
      <button onClick={onConfirm} disabled={busy}>{busy ? <Loader2 size={17} className="spin" /> : null}Confirmar importacion</button>
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

function TransaccionesView({ token, products, user, onRevert, canRevert, reloadKey, onExportError }) {
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

  useEffect(() => {
    const t = setTimeout(() => load(), 200);
    return () => clearTimeout(t);
  }, [tipoFilter, reloadKey]);

  // Precio por producto para estimar el total de cada venta (los movimientos no guardan total)
  const priceById = useMemo(() => {
    const m = {};
    (products || []).forEach(p => {
      const key = String(p.id);
      m[key] = Number(p.precio) || 0;
      if (p.nombre) m["n:" + p.nombre.toLowerCase()] = Number(p.precio) || 0;
    });
    return m;
  }, [products]);

  function rowTotal(t) {
    if (t.tipo !== "venta") return null;
    const unit = priceById[String(t.producto_id)] ?? priceById["n:" + String(t.producto_nombre || "").toLowerCase()] ?? 0;
    if (!unit) return null;
    return Number(t.cantidad) * unit;
  }

  const TIPOS = [
    { value: "", label: "Todas", color: "#64748b" },
    { value: "venta", label: "Ventas", color: "#1e3a8a" },
    { value: "entrada", label: "Entradas", color: "#166534" },
    { value: "salida", label: "Salidas", color: "#991b1b" },
    { value: "ajuste", label: "Ajustes", color: "#92400e" },
    { value: "revertida", label: "Canceladas", color: "#64748b" }
  ];

  return (
    <div className="transactions-list tx-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Transacciones</h2>
          <p className="page-desc">Historial de movimientos: ventas, entradas, salidas y cancelaciones.</p>
        </div>
        <button className="btn-ghost" onClick={() => downloadExcel(token, "/exportar/ventas", "ventas.xlsx", onExportError)} title="Exportar ventas a Excel"><Download size={16} /> Exportar</button>
      </div>
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

      <div className="table-card tx-card">
        <div className="table-scroll">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Movimiento</th>
                <th>Cantidad</th>
                <th>Total</th>
                {canRevert && <th><span className="sr-only">Acción</span></th>}
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => {
                const tot = rowTotal(t);
                const tipoCls = t.revertida ? "cancelada" : (t.tipo || "");
                return (
                  <tr key={t.id} className={t.revertida ? "is-reverted" : ""}>
                    <td className="tx-fecha">{t.fecha}</td>
                    <td>
                      <strong>{t.producto_nombre || "—"}</strong>
                      {(t.nota || t.usuario_nombre) && <small className="tx-meta">{t.usuario_nombre || ""}{t.nota ? ` · ${t.nota}` : ""}{t.revertida ? ` · revertida${t.motivo_reversion ? ": " + t.motivo_reversion : ""}` : ""}</small>}
                    </td>
                    <td><span className={`badge ${tipoCls}`}>{t.revertida ? "cancelada" : t.tipo}</span></td>
                    <td className="stock-col">{t.cantidad} uds</td>
                    <td className="stock-col">{tot != null ? `$${tot.toLocaleString()}` : "—"}</td>
                    {canRevert && (
                      <td className="tx-act">
                        <button className={"danger revert-btn" + (t.revertida ? " restore-btn" : "")} onClick={() => onRevert(t)} title={t.revertida ? "Restaurar transacción" : "Revertir transacción"}>{t.revertida ? "Restaurar" : "Revertir"}</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {transactions.length === 0 && (
                <tr><td colSpan={canRevert ? 6 : 5} className="empty-cell">No hay transacciones para mostrar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="tx-cards">
          {transactions.map(t => {
            const tot = rowTotal(t);
            const tipoCls = t.revertida ? "cancelada" : (t.tipo || "");
            return (
              <div className={"tx-mcard" + (t.revertida ? " is-reverted" : "")} key={t.id}>
                <div className="tx-mtop"><strong>{t.producto_nombre || "—"}</strong><span className={`badge ${tipoCls}`}>{t.revertida ? "cancelada" : t.tipo}</span></div>
                <small className="muted">{t.fecha} · {t.cantidad} uds{tot != null ? ` · $${tot.toLocaleString()}` : ""}</small>
                {canRevert && <button className={"danger revert-btn" + (t.revertida ? " restore-btn" : "")} onClick={() => onRevert(t)}>{t.revertida ? "Restaurar" : "Revertir"}</button>}
              </div>
            );
          })}
          {transactions.length === 0 && <p className="muted">No hay transacciones para mostrar.</p>}
        </div>
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
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);

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
    setBusyId(id);
    try {
      await api(token, `/productos/${id}/restaurar`, { method: "POST" });
      setMessage("Producto restaurado correctamente.");
      load();
    } catch (err) {
      setMessage("Error al restaurar: " + err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function purgeAll() {
    if (!confirm("¿Eliminar fisicamente todos los productos en la papelera con mas de 7 dias?")) return;
    setBusy(true);
    try {
      const result = await api(token, "/productos/purgar", { method: "POST" });
      setMessage(`Papelera purgada: ${result.purged} productos eliminados.`);
      load();
    } catch (err) {
      setMessage("Error al purgar: " + err.message);
    } finally {
      setBusy(false);
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
        <button className="danger" onClick={purgeAll} disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}Purgar antiguos</button>
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
                <button className="icon-only" onClick={() => restore(p.id)} title="Restaurar" disabled={busyId === p.id}>{busyId === p.id ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Ganancias({ token, onExportError }) {
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

  useEffect(() => {
    const t = setTimeout(() => load(), 200);
    return () => clearTimeout(t);
  }, [periodo]);

  const periodos = [
    { value: "dia", label: "Hoy" },
    { value: "semana", label: "Semana" },
    { value: "mes", label: "Mes" }
  ];

  const perdidaCls = "col-perdida";
  const margenBajoCls = "col-margen-bajo";

  return (
    <section className="gain-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Ganancias</h2>
          <p className="page-desc">Rentabilidad del negocio por período.</p>
        </div>
        <div className="gain-tools">
          <div className="period-filters" role="tablist" aria-label="Período">
            {periodos.map(p => (
              <button key={p.value} className={`period-btn${periodo === p.value ? " active" : ""}`}
                onClick={() => setPeriodo(p.value)}
              >{p.label}</button>
            ))}
          </div>
          <button className="btn-ghost" onClick={() => downloadExcel(token, "/exportar/ganancias", "ganancias.xlsx", onExportError)} title="Exportar ganancias a Excel"><Download size={16} /> Exportar</button>
        </div>
      </div>

      {!loading && (
        <p className="gain-hero">
          <span className="gain-label">Ganancia {periodo === "dia" ? "de hoy" : periodo === "semana" ? "de la semana" : "del mes"}</span>
          <strong className="gain-big">${data.totalGanancia.toLocaleString()}</strong>
        </p>
      )}

      {!loading && evolution.length > 0 && (
        <div className="chart-box chart-hero">
          <h3>Evolución últimos 30 días</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={evolution} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "var(--text-secondary)" }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-secondary)" }} />
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} formatter={(v) => [`$${v.toLocaleString()}`, "Ganancia"]} labelFormatter={(l) => `Día: ${l}`} />
              <Bar dataKey="ganancia" fill="var(--accent)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && (
        <p className="gain-sum">
          <span>Ventas <strong>${data.totalIngresos.toLocaleString()}</strong></span>
          <span>Costos <strong>${(data.totalIngresos - data.totalGanancia).toLocaleString()}</strong></span>
          <span>Ganancia <strong>${data.totalGanancia.toLocaleString()}</strong></span>
        </p>
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
