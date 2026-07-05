# Sistema Papeleria

Monorepo inicial para el sistema de inventario descrito en `plan-sistema-inventario-papeleria.md`.

## Estructura

- `core`: API Fastify, autenticacion, reglas de negocio y SQLite.
- `frontend`: interfaz React/Vite.
- `shared`: constantes compartidas.
- `desktop`: empaque local con Electron.
- `server`: base para despliegue VPS multi-tenant.

## Funciones actuales

- Productos con codigo de barras, imagen, stock minimo, baja logica y movimientos.
- Ventas con descuento automatico de stock.
- Roles y permisos por modulo/accion, administrables desde Configuracion.
- Usuarios activos/inactivos.
- Importacion CSV/XLSX para admin con plantilla, vista previa, confirmacion y bitacora.
- Al importar, `cantidad` se interpreta como stock total actualizado. Si baja frente al stock actual, la vista previa muestra alerta antes de confirmar.

## Desarrollo local

```bash
npm install
npm run dev
```

El backend escucha en `http://localhost:4000` y el frontend en `http://localhost:5173`.

Nota en Windows: si PowerShell bloquea `npm`, ejecuta `npm.cmd install` o `npm.cmd run dev`.

Usuario inicial:

- Usuario: `admin`
- Password: `admin123`
