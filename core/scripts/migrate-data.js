// ────────────────────────────────────────────────────────────
// migrate-data.js — Migrate SQLite data to Supabase Postgres
// ────────────────────────────────────────────────────────────
// Usage: node scripts/migrate-data.js
//   Reads from PAPELERIA_DB (default: core/data/papeleria.db)
//   Writes to SUPABASE_DATABASE_URL (staging or production)
//   Dry-run: node scripts/migrate-data.js --dry-run
// ────────────────────────────────────────────────────────────

import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import crypto from "node:crypto";

const DRY_RUN = process.argv.includes("--dry-run");

const SQLITE_PATH = process.env.PAPELERIA_DB || new URL("../data/papeleria.db", import.meta.url).pathname;
const PG_URL = process.env.SUPABASE_DATABASE_URL;
if (!PG_URL) { console.error("FATAL: SUPABASE_DATABASE_URL not set"); process.exit(1); }

// ─── helpers ────────────────────────────────────────────────
const uuid = () => crypto.randomUUID();

const sqlite = new DatabaseSync(SQLITE_PATH);
const pgPool = DRY_RUN ? null : new pg.Pool({ connectionString: PG_URL, max: 1 });
const q = DRY_RUN ? async () => {} : (t, p) => pgPool.query(t, p);

// ID maps: sqlite_int → postgres_uuid
const idMap = { roles: new Map(), users: new Map(), productos: new Map(), movimientos: new Map(), ventas: new Map(), permisos: new Map() };

let totalInserted = 0;
const log = (label, count, detail = "") => {
  console.log(`  ${label}: ${count}${detail ? " " + detail : ""}`);
  totalInserted += count;
};

// ─── Phase 1: Create tenant ─────────────────────────────────
console.log("\n=== Phase 1: Tenant ===");
const TENANT_SUBDOMAIN = "migrated";
const tenant = await q(
  `INSERT INTO tenants (subdomain, nombre) VALUES ($1, $2)
   ON CONFLICT (subdomain) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
  [TENANT_SUBDOMAIN, "Migrated Tenant"]
);
const TENANT_ID = DRY_RUN ? uuid() : tenant.rows[0].id;
log("tenant", 1, TENANT_ID);

// ─── Phase 2: Permisos (match seeded data) ─────────────────
console.log("\n=== Phase 2: Permisos ===");
// Postgres already has seeded permisos with codigo = "modulo_accion"
// Map SQLite (modulo, accion) → Postgres codigo
const pgPermisos = DRY_RUN ? [] : (await q(`SELECT id, codigo FROM permisos`)).rows;
const pgPermMap = new Map(pgPermisos.map(p => [p.codigo, p.id]));

const sqlPermisos = sqlite.prepare("SELECT * FROM permisos").all();
let permMapped = 0;
for (const sp of sqlPermisos) {
  const codigo = `${sp.modulo}_${sp.accion}`;
  const pgId = pgPermMap.get(codigo);
  if (pgId) {
    idMap.permisos.set(sp.id, pgId);
    permMapped++;
  } else {
    console.warn(`  WARN: No matching Postgres permiso for (${sp.modulo}, ${sp.accion}) → ${codigo}`);
  }
}
log("permisos mapeados", permMapped, `(de ${sqlPermisos.length} SQLite)`);

// ─── Phase 3: Roles ─────────────────────────────────────────
console.log("\n=== Phase 3: Roles ===");
const sqlRoles = sqlite.prepare("SELECT * FROM roles").all();
const createdRoles = [];
for (const sr of sqlRoles) {
  const newId = uuid();
  idMap.roles.set(sr.id, newId);
  if (!DRY_RUN) {
    await q(
      `INSERT INTO roles (id, tenant_id, nombre, descripcion, es_sistema, activo, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, nombre) DO NOTHING`,
      [newId, TENANT_ID, sr.nombre, null, sr.es_sistema ? true : false, sr.activo ? true : false, sr.creado_en]
    );
  }
  createdRoles.push(sr.nombre);
}
log("roles", sqlRoles.length, createdRoles.join(", "));

// ─── Phase 4: Usuarios → users ──────────────────────────────
console.log("\n=== Phase 4: Usuarios → users ===");
const sqlUsers = sqlite.prepare("SELECT * FROM usuarios").all();
for (const su of sqlUsers) {
  const newId = uuid();
  idMap.users.set(su.id, newId);
  const rolId = su.rol_id ? idMap.roles.get(su.rol_id) : null;
  if (!DRY_RUN) {
    await q(
      `INSERT INTO users (id, tenant_id, username, password_hash, nombre, rol_id, activo, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, username) DO NOTHING`,
      [newId, TENANT_ID, su.usuario, su.password_hash, su.usuario, rolId, su.activo ? true : false, su.creado_en]
    );
  }
}
log("users", sqlUsers.length);

// ─── Phase 5: Rol_Permisos ──────────────────────────────────
console.log("\n=== Phase 5: Rol_Permisos ===");
const sqlRp = sqlite.prepare("SELECT * FROM rol_permisos").all();
let rpCount = 0;
for (const srp of sqlRp) {
  const rolUuid = idMap.roles.get(srp.rol_id);
  const permUuid = idMap.permisos.get(srp.permiso_id);
  if (!rolUuid || !permUuid) { console.warn(`  WARN: skipping rol_permiso (${srp.rol_id}, ${srp.permiso_id}) — missing mapping`); continue; }
  if (!DRY_RUN) {
    await q(
      `INSERT INTO rol_permisos (tenant_id, rol_id, permiso_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [TENANT_ID, rolUuid, permUuid]
    );
  }
  rpCount++;
}
log("rol_permisos", rpCount);

// ─── Phase 6: Productos ─────────────────────────────────────
console.log("\n=== Phase 6: Productos ===");
const sqlProds = sqlite.prepare("SELECT * FROM productos").all();
for (const sp of sqlProds) {
  const newId = uuid();
  idMap.productos.set(sp.id, newId);
  const eliminadoPor = sp.eliminado_por ? idMap.users.get(sp.eliminado_por) : null;
  if (!DRY_RUN) {
    await q(
      `INSERT INTO productos (id, tenant_id, codigo, sku, codigo_barras, nombre, nombre_normalizado, categoria,
        precio_compra, precio_venta, stock, stock_minimo, en_papelera, fecha_eliminacion, eliminado_por,
        activo, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (id) DO NOTHING`,
      [newId, TENANT_ID, sp.sku || null, sp.sku || null, sp.codigo_barras || null, sp.nombre,
       sp.nombre_normalizado || null, sp.categoria || null,
       sp.costo || 0, sp.precio || 0, sp.cantidad_stock || 0, sp.stock_minimo || 0,
       sp.en_papelera ? true : false, sp.fecha_eliminacion || null, eliminadoPor,
       sp.activo ? true : false, sp.creado_en, sp.actualizado_en || sp.creado_en]
    );
  }
}
log("productos", sqlProds.length);

// ─── Phase 7: Movimientos → transactions ────────────────────
console.log("\n=== Phase 7: Movimientos → transactions ===");
const sqlMovs = sqlite.prepare("SELECT * FROM movimientos").all();
for (const sm of sqlMovs) {
  const newId = uuid();
  idMap.movimientos.set(sm.id, newId);
  const prodId = idMap.productos.get(sm.producto_id);
  const userId = idMap.users.get(sm.usuario_id);
  const revertidoPor = sm.revertida_por ? idMap.users.get(sm.revertida_por) : null;
  if (!DRY_RUN) {
    await q(
      `INSERT INTO transactions (id, tenant_id, tipo, referencia_id, referencia_tipo, monto, descripcion,
        user_id, revertida, revertida_por, motivo_reversion, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
      [newId, TENANT_ID, sm.tipo, prodId, "producto", sm.cantidad, sm.nota || null,
       userId, sm.revertida ? true : false, revertidoPor, sm.motivo_reversion || null, sm.fecha]
    );
  }
}
log("transactions", sqlMovs.length);

// ─── Phase 8: Ventas → ventas + ventas_detalle ──────────────
console.log("\n=== Phase 8: Ventas ===");
const sqlVentas = sqlite.prepare("SELECT * FROM ventas ORDER BY id ASC").all();
const seenHeaders = new Set();
let vCount = 0;
let vdCount = 0;
for (const sv of sqlVentas) {
  const headerId = uuid();
  idMap.ventas.set(sv.id, headerId);
  const userId = idMap.users.get(sv.usuario_id);
  const prodId = idMap.productos.get(sv.producto_id);
  if (!userId) { console.warn(`  WARN: venta ${sv.id} — usuario ${sv.usuario_id} not found, skipping`); continue; }
  if (!prodId) { console.warn(`  WARN: venta ${sv.id} — producto ${sv.producto_id} not found, skipping`); continue; }

  if (!DRY_RUN) {
    // Create header only once per SQLite venta id (each flat row becomes its own header+detail)
    await q(
      `INSERT INTO ventas (id, tenant_id, folio, cliente_id, user_id, total, descuento, forma_pago, estatus, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [headerId, TENANT_ID, `MIGRATED-${sv.id}`, null, userId, sv.total || 0, 0, "efectivo",
       sv.anulada ? "anulada" : "completada", sv.fecha]
    );
    vCount++;

    await q(
      `INSERT INTO ventas_detalle (tenant_id, venta_id, producto_id, cantidad, precio_unitario, subtotal)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [TENANT_ID, headerId, prodId, sv.cantidad, sv.precio_unitario, sv.total || 0]
    );
    vdCount++;
  } else {
    vCount++;
    vdCount++;
  }
}
log("ventas headers", vCount);
log("ventas_detalle rows", vdCount);

// ─── Phase 9: Audit logs ────────────────────────────────────
console.log("\n=== Phase 9: Audit Logs ===");

// 9a: bitacora_auditoria
const sqlAudit = sqlite.prepare("SELECT * FROM bitacora_auditoria").all();
for (const sa of sqlAudit) {
  const userId = idMap.users.get(sa.usuario_id);
  if (!DRY_RUN) {
    const detalle = {};
    if (sa.campo) detalle.campo = sa.campo;
    if (sa.valor_anterior) detalle.valor_anterior = sa.valor_anterior;
    if (sa.valor_nuevo) detalle.valor_nuevo = sa.valor_nuevo;
    if (sa.detalle) detalle.detalle_original = sa.detalle;
    await q(
      `INSERT INTO audit_log (tenant_id, user_id, accion, entidad, entidad_id, detalle, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [TENANT_ID, userId, sa.accion, sa.entidad, String(sa.entidad_id),
       Object.keys(detalle).length > 0 ? JSON.stringify(detalle) : null, sa.fecha_hora]
    );
  }
}
log("audit_log (bitacora_auditoria)", sqlAudit.length);

// 9b: bitacora_importaciones
const sqlImport = sqlite.prepare("SELECT * FROM bitacora_importaciones").all();
for (const si of sqlImport) {
  const userId = idMap.users.get(si.usuario_admin_id);
  const prodId = idMap.productos.get(si.producto_id);
  if (!DRY_RUN) {
    const detalle = JSON.stringify({
      tipo_cambio: si.tipo_cambio,
      valor_anterior: si.valor_anterior,
      valor_nuevo: si.valor_nuevo,
      archivo_origen: si.archivo_origen
    });
    await q(
      `INSERT INTO audit_log (tenant_id, user_id, accion, entidad, entidad_id, detalle, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [TENANT_ID, userId, "importar_" + si.tipo_cambio, "producto_import", prodId, detalle, si.fecha_hora]
    );
  }
}
log("audit_log (importaciones)", sqlImport.length);

// 9c: bitacora_reversiones
const sqlRev = sqlite.prepare("SELECT * FROM bitacora_reversiones").all();
for (const sr of sqlRev) {
  const userId = idMap.users.get(sr.usuario_id);
  const movId = idMap.movimientos.get(sr.movimiento_id);
  if (!DRY_RUN) {
    const detalle = JSON.stringify({ movimiento_id: movId, motivo: sr.motivo });
    await q(
      `INSERT INTO audit_log (tenant_id, user_id, accion, entidad, entidad_id, detalle, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [TENANT_ID, userId, "revertir", "reversion", movId, detalle, sr.fecha_hora]
    );
  }
}
log("audit_log (reversiones)", sqlRev.length);

// ─── Phase 10: Verify row counts ────────────────────────────
console.log("\n=== Phase 10: Verification ===");
if (DRY_RUN) {
  console.log(`  DRY RUN: ${totalInserted} rows would be inserted`);
} else {
  const verifications = [
    ["productos", "productos"],
    ["users", "usuarios"],
    ["roles", "roles"],
    ["transactions", "movimientos"],
    ["ventas", "ventas"],
    ["audit_log", "bitacora_auditoria"],
  ];
  let allOk = true;
  for (const [pgTable, sqlTable] of verifications) {
    const pgCount = (await q(`SELECT COUNT(*)::int AS c FROM ${pgTable} WHERE tenant_id = $1`, [TENANT_ID])).rows[0].c;
    const sqlCount = sqlite.prepare(`SELECT COUNT(*) AS c FROM ${sqlTable}`).get().c;
    const status = pgCount === sqlCount ? "OK" : "MISMATCH";
    if (status !== "OK") allOk = false;
    console.log(`  ${pgTable}: Postgres=${pgCount} SQLite=${sqlCount} — ${status}`);
  }
  // Special checks
  const vdCount_pg = (await q(`SELECT COUNT(*)::int AS c FROM ventas_detalle WHERE tenant_id = $1`, [TENANT_ID])).rows[0].c;
  console.log(`  ventas_detalle: Postgres=${vdCount_pg}`);
  const importLogs_pg = (await q(`SELECT COUNT(*)::int AS c FROM audit_log WHERE tenant_id = $1 AND entidad = 'producto_import'`, [TENANT_ID])).rows[0].c;
  console.log(`  audit_log (importaciones): Postgres=${importLogs_pg}`);
  const revLogs_pg = (await q(`SELECT COUNT(*)::int AS c FROM audit_log WHERE tenant_id = $1 AND accion = 'revertir'`, [TENANT_ID])).rows[0].c;
  console.log(`  audit_log (reversiones): Postgres=${revLogs_pg}`);

  if (allOk) console.log("\n✓ All counts match!");
  else console.log("\n✗ Some counts mismatch — review warnings above");
}

// Cleanup
sqlite.close();
if (pgPool) await pgPool.end();
console.log("\n=== Migration complete ===");
