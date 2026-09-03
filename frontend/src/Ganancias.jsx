import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, ShoppingCart, Boxes } from "lucide-react";

// API helper (same shape as main.jsx) so this chunk stays self-contained and
// can be code-split/lazy-loaded without pulling in the whole bundle.
const API_URL =
  typeof window !== "undefined" &&
  (window.__VITE_API_URL__ || window.__API_URL__) ||
  (import.meta.env.PROD ? "" : "http://127.0.0.1:4000");

function noopPath(p) { return "/" + p.replace(/^\/+/, "").replace(/\/+$/, ""); }

async function api(token, path, options = {}) {
  const isForm = options.body instanceof FormData;
  const hasJsonBody = options.body && !isForm;
  const base = API_URL.replace(/\/+$/, "");
  const res = await fetch(base + noopPath(path), {
    ...options,
    headers: {
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const type = res.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data.message || data || "Error de servidor");
  return data;
}

function Metric({ icon, label, value }) {
  return <div className="metric">{icon}<div><span>{label}</span><strong>{value}</strong></div></div>;
}

export default function Ganancias({ token }) {
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
      setData({
        totalGanancia: res?.totalGanancia ?? 0,
        totalIngresos: res?.totalIngresos ?? 0,
        products: Array.isArray(res?.products) ? res.products : [],
      });
      setEvolution(Array.isArray(evo) ? evo : []);
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
          <Metric icon={<TrendingUp />} label="Ganancia total" value={`$${(data.totalGanancia ?? 0).toLocaleString()}`} />
          <Metric icon={<ShoppingCart />} label="Ingresos totales" value={`$${(data.totalIngresos ?? 0).toLocaleString()}`} />
          <Metric icon={<Boxes />} label="Productos" value={data.products?.length ?? 0} />
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
               <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} formatter={(v) => [`$${(v ?? 0).toLocaleString()}`, "Ganancia"]} labelFormatter={(l) => `Día: ${l}`} />
              <Bar dataKey="ganancia" fill="var(--accent)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {loading ? <p className="muted">Cargando...</p> : (data.products?.length ?? 0) === 0 ? <p className="muted">Sin datos en este periodo.</p> : (
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
                <span className="stock-col">${(p.costo ?? 0).toLocaleString()}</span>
                <span className="stock-col">${(p.precio ?? 0).toLocaleString()}</span>
                <span className={`stock-col ${perdida ? perdidaCls : ""}`}>
                  {perdida ? "-" : "+"}${Math.abs(p.ganancia_unitaria ?? 0).toLocaleString()}
                </span>
                <span className={`stock-col ${perdida ? perdidaCls : p.margen < 10 ? margenBajoCls : ""}`}>
                  {p.margen}%
                </span>
                <span className="stock-col col-ganancia-total">
                  ${(p.ganancia_total ?? 0).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
