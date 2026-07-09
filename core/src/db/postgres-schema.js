export const schemaSQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subdomain VARCHAR(255) NOT NULL UNIQUE,
  nombre VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permisos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS productos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  codigo VARCHAR(100),
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  precio_compra DECIMAL(12,2) NOT NULL DEFAULT 0,
  precio_venta DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock_minimo DECIMAL(12,2) NOT NULL DEFAULT 0,
  unidad VARCHAR(50) DEFAULT 'pieza',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  telefono VARCHAR(50),
  direccion TEXT,
  email VARCHAR(255),
  credito_limite DECIMAL(12,2) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  rol_id UUID,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, username)
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, nombre)
);

CREATE TABLE IF NOT EXISTS rol_permisos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  rol_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id UUID NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  UNIQUE(tenant_id, rol_id, permiso_id)
);

CREATE TABLE IF NOT EXISTS ventas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  folio VARCHAR(50) NOT NULL,
  cliente_id UUID REFERENCES clientes(id),
  user_id UUID REFERENCES users(id),
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento DECIMAL(12,2) NOT NULL DEFAULT 0,
  forma_pago VARCHAR(50) DEFAULT 'efectivo',
  estatus VARCHAR(20) NOT NULL DEFAULT 'completada',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, folio)
);

CREATE TABLE IF NOT EXISTS ventas_detalle (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad DECIMAL(12,2) NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS compras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  folio VARCHAR(50),
  proveedor VARCHAR(255),
  user_id UUID REFERENCES users(id),
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  estatus VARCHAR(20) NOT NULL DEFAULT 'recibida',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, folio)
);

CREATE TABLE IF NOT EXISTS compras_detalle (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  compra_id UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad DECIMAL(12,2) NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  user_id UUID REFERENCES users(id),
  accion VARCHAR(100) NOT NULL,
  entidad VARCHAR(100) NOT NULL,
  entidad_id UUID,
  detalle JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  referencia_id UUID,
  referencia_tipo VARCHAR(100),
  monto DECIMAL(12,2) NOT NULL,
  forma_pago VARCHAR(50),
  descripcion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  filename VARCHAR(255) NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  estatus VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productos_tenant ON productos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_tenant ON clientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ventas_tenant ON ventas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ventas_detalle_tenant ON ventas_detalle(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compras_tenant ON compras(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compras_detalle_tenant ON compras_detalle(tenant_id);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rol_permisos_tenant ON rol_permisos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_backups_tenant ON backups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_detalle_venta ON ventas_detalle(venta_id);
CREATE INDEX IF NOT EXISTS idx_compras_detalle_compra ON compras_detalle(compra_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
`;
