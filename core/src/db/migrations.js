import bcrypt from "bcryptjs";

const PERMISSIONS = [
  "productos:ver", "productos:crear", "productos:editar", "productos:eliminar",
  "ventas:ver", "ventas:crear", "ventas:editar", "ventas:eliminar",
  "stock:ver", "stock:crear", "stock:editar", "stock:eliminar",
  "reportes:ver", "reportes:crear", "reportes:editar", "reportes:eliminar",
  "usuarios:ver", "usuarios:crear", "usuarios:editar", "usuarios:eliminar",
  "roles:ver", "roles:crear", "roles:editar", "roles:eliminar",
  "importacion:ver", "importacion:crear", "importacion:editar", "importacion:eliminar",
  "configuracion:ver", "configuracion:crear", "configuracion:editar", "configuracion:eliminar"
];

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'admin',
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      sku TEXT UNIQUE,
      categoria TEXT,
      cantidad_stock INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_stock >= 0),
      stock_minimo INTEGER NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
      precio INTEGER NOT NULL CHECK (precio >= 0),
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      es_sistema INTEGER NOT NULL DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS permisos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modulo TEXT NOT NULL,
      accion TEXT NOT NULL,
      UNIQUE(modulo, accion)
    );

    CREATE TABLE IF NOT EXISTS rol_permisos (
      rol_id INTEGER NOT NULL,
      permiso_id INTEGER NOT NULL,
      PRIMARY KEY (rol_id, permiso_id),
      FOREIGN KEY (rol_id) REFERENCES roles(id),
      FOREIGN KEY (permiso_id) REFERENCES permisos(id)
    );

    CREATE TABLE IF NOT EXISTS movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'venta', 'ajuste')),
      cantidad INTEGER NOT NULL CHECK (cantidad > 0),
      usuario_id INTEGER NOT NULL,
      nota TEXT,
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (producto_id) REFERENCES productos(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL CHECK (cantidad > 0),
      precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0),
      total INTEGER NOT NULL CHECK (total >= 0),
      usuario_id INTEGER NOT NULL,
      anulada INTEGER NOT NULL DEFAULT 0,
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (producto_id) REFERENCES productos(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);
    CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha);
    CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
    CREATE INDEX IF NOT EXISTS idx_ventas_producto ON ventas(producto_id);
  `);

  addColumn(db, "usuarios", "rol_id", "INTEGER");
  addColumn(db, "productos", "codigo_barras", "TEXT");
  addColumn(db, "productos", "imagen_url", "TEXT");
  addColumn(db, "productos", "thumbnail_url", "TEXT");
  addColumn(db, "productos", "nombre_normalizado", "TEXT");

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_codigo_barras
    ON productos(codigo_barras)
    WHERE codigo_barras IS NOT NULL AND codigo_barras != '';

    CREATE INDEX IF NOT EXISTS idx_productos_nombre_normalizado
    ON productos(nombre_normalizado);

    CREATE TABLE IF NOT EXISTS bitacora_reversiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha_hora TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      usuario_id INTEGER NOT NULL,
      movimiento_id INTEGER NOT NULL,
      motivo TEXT,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (movimiento_id) REFERENCES movimientos(id)
    );

    CREATE TABLE IF NOT EXISTS bitacora_importaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha_hora TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      usuario_admin_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      tipo_cambio TEXT NOT NULL CHECK (tipo_cambio IN ('creado', 'actualizado')),
      valor_anterior TEXT,
      valor_nuevo TEXT NOT NULL,
      archivo_origen TEXT NOT NULL,
      FOREIGN KEY (usuario_admin_id) REFERENCES usuarios(id),
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    );

    CREATE TABLE IF NOT EXISTS bitacora_auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha_hora TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      usuario_id INTEGER NOT NULL,
      entidad TEXT NOT NULL,
      entidad_id INTEGER NOT NULL,
      accion TEXT NOT NULL,
      campo TEXT,
      valor_anterior TEXT,
      valor_nuevo TEXT,
      detalle TEXT,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
  `);

  // Add reversion columns to movimientos
  addColumn(db, "movimientos", "revertida", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "movimientos", "revertida_por", "INTEGER");
  addColumn(db, "movimientos", "motivo_reversion", "TEXT");

  // Add trash columns to productos
  addColumn(db, "productos", "en_papelera", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "productos", "fecha_eliminacion", "TEXT");
  addColumn(db, "productos", "eliminado_por", "INTEGER");

  // Add trash columns to movimientos
  addColumn(db, "movimientos", "en_papelera", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "movimientos", "fecha_eliminacion", "TEXT");
  addColumn(db, "movimientos", "eliminado_por", "INTEGER");

  const count = db.prepare("SELECT COUNT(*) AS total FROM usuarios").get().total;
  if (count === 0) {
    db.prepare("INSERT INTO usuarios (usuario, password_hash, rol) VALUES (?, ?, ?)")
      .run("admin", bcrypt.hashSync("admin123", 10), "admin");
  }

  seedRolesAndPermissions(db);
  backfillUsersAndProducts(db);
}

function addColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedRolesAndPermissions(db) {
  const roleStmt = db.prepare("INSERT OR IGNORE INTO roles (nombre, es_sistema) VALUES (?, ?)");
  roleStmt.run("admin", 1);
  roleStmt.run("vendedor", 1);
  roleStmt.run("inventario", 1);

  const permStmt = db.prepare("INSERT OR IGNORE INTO permisos (modulo, accion) VALUES (?, ?)");
  for (const key of PERMISSIONS) {
    const [modulo, accion] = key.split(":");
    permStmt.run(modulo, accion);
  }

  const admin = db.prepare("SELECT id FROM roles WHERE nombre = 'admin'").get();
  const vendedor = db.prepare("SELECT id FROM roles WHERE nombre = 'vendedor'").get();
  const inventario = db.prepare("SELECT id FROM roles WHERE nombre = 'inventario'").get();

  assignAll(db, admin.id);
  assignSome(db, vendedor.id, ["productos:ver", "ventas:ver", "ventas:crear", "reportes:ver"]);
  assignSome(db, inventario.id, ["productos:ver", "productos:crear", "productos:editar", "stock:ver", "stock:crear", "stock:editar", "reportes:ver"]);
}

function assignAll(db, roleId) {
  db.prepare(`
    INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id)
    SELECT ?, id FROM permisos
  `).run(roleId);
}

function assignSome(db, roleId, keys) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id)
    SELECT ?, id FROM permisos WHERE modulo = ? AND accion = ?
  `);
  for (const key of keys) {
    const [modulo, accion] = key.split(":");
    stmt.run(roleId, modulo, accion);
  }
}

function backfillUsersAndProducts(db) {
  db.prepare(`
    UPDATE usuarios
    SET rol_id = (SELECT id FROM roles WHERE roles.nombre = usuarios.rol)
    WHERE rol_id IS NULL
  `).run();

  const products = db.prepare("SELECT id, nombre FROM productos WHERE nombre_normalizado IS NULL OR nombre_normalizado = ''").all();
  const update = db.prepare("UPDATE productos SET nombre_normalizado = ? WHERE id = ?");
  for (const product of products) {
    update.run(normalizeName(product.nombre), product.id);
  }

  // Backfill: mark ventas as anulada for already-reverted sale-type movimientos
  const revertedSales = db.prepare("SELECT id, nota FROM movimientos WHERE tipo = 'venta' AND revertida = 1").all();
  const markAnulada = db.prepare("UPDATE ventas SET anulada = 1 WHERE id = ? AND anulada = 0");
  for (const mov of revertedSales) {
    if (mov.nota) {
      const match = mov.nota.match(/Venta #(\d+)/);
      if (match) markAnulada.run(Number(match[1]));
    }
  }
  if (revertedSales.length > 0) console.log(`[backfill] Marcadas ${revertedSales.length} ventas como anuladas por reversión existente.`);
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
