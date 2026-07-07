# Sistema Papelería

Sistema de inventario, ventas y reportes para papelerías. Backend Fastify + SQLite, frontend React/Vite.

## Estructura del proyecto

```
papeleria/
├── core/                    # API backend (Fastify + SQLite)
│   └── src/
│       ├── app.js           # Configuración de Fastify, CORS, JWT, plugins
│       ├── index.js          # Punto de entrada: arranca server, backups, cloud
│       ├── config.js         # Config (puerto, JWT secret, rutas)
│       ├── routes/           # Rutas de la API
│       │   ├── auth-routes.js       # Login, /me
│       │   ├── export-routes.js     # Exportar Excel (productos, ventas, reportes)
│       │   ├── import-routes.js     # Importar CSV/XLSX
│       │   ├── products-routes.js   # CRUD productos, movimientos, papelera
│       │   ├── reports-routes.js    # Reportes de stock, ventas
│       │   ├── roles-routes.js      # Gestión de roles y permisos
│       │   ├── sales-routes.js      # Ventas
│       │   ├── transactions-routes.js # Transacciones y reversiones
│       │   └── users-routes.js      # CRUD usuarios
│       ├── services/         # Lógica de negocio
│       │   ├── rate-limiter.js      # Límite de intentos de login
│       │   ├── cloud-backup.js      # Sincronización DB con Supabase Storage
│       │   ├── backup-service.js    # Backups diarios con timestamp
│       │   ├── sentry.js            # Monitoreo de errores
│       │   ├── products-service.js
│       │   ├── sales-service.js
│       │   ├── transactions-service.js
│       │   ├── reports-service.js
│       │   ├── users-service.js
│       │   ├── roles-service.js
│       │   ├── permissions-service.js
│       │   ├── import-service.js
│       │   ├── audit-service.js
│       │   └── admin-confirmation-service.js
│       ├── db/               # Conexión a SQLite, migraciones
│       └── tests/            # Tests automatizados
│           └── rate-limiter.test.js
└── frontend/                 # Interfaz web (React + Vite)
    └── src/
        ├── main.jsx          # App completa (SPA)
        ├── styles.css        # Estilos con modo oscuro incluido
        └── index.html
```

## Requisitos

- **Node.js >= 22.5.0** (por `node:sqlite`)
- **Supabase** (gratis) para sincronización cloud y backups

## Configuración inicial

### 1. Clonar e instalar dependencias

```bash
cd core
npm install
cd ../frontend
npm install
```

### 2. Variables de entorno (`core/.env`)

Copia este archivo en `core/.env`:

```env
PORT=4000
HOST=0.0.0.0
JWT_SECRET=genera-una-clave-segura-aleatoria
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_KEY=tu-service-role-key
SENTRY_DSN=  # Opcional: URL de Sentry para monitoreo de errores
```

> **⚠️ Importante:** `JWT_SECRET` debe ser una clave larga y aleatoria. NO uses el valor por defecto en producción.
> Las claves de Supabase se obtienen de: Settings → API → Project URL / service_role key.

### 3. Iniciar en desarrollo

```bash
# Terminal 1: backend
cd core
npm run dev

# Terminal 2: frontend
cd frontend
npm run dev
```

Backend: `http://localhost:4000`  
Frontend: `http://localhost:5173`

## Usuario por defecto

| Usuario | Password  | Rol   |
|---------|-----------|-------|
| admin   | admin123  | admin |

> **⚠️ Cambia la contraseña del admin inmediatamente en producción.**

## Funcionalidades

### Productos
- CRUD completo con nombre, precio, stock, imágenes, código de barras, SKU
- Búsqueda por nombre
- Movimientos de stock (entrada, salida, ajuste)
- Edición inline desde la tabla
- Baja lógica con papelera (restauración en 7 días)

### Ventas
- Registrar venta con selección de producto y cantidad
- Descuento automático de stock
- Validaciones: stock suficiente, precio configurado, producto activo
- Anular venta (devuelve stock, marca `anulada=1`)
- Exportar ventas a Excel

### Transacciones
- Timeline agrupada por año → mes → día
- Filtros por fecha, producto, tipo
- Reversión con confirmación de admin (requiere contraseña)
- Las revertidas se marcan visualmente (tachado, gris)

### Reportes
- **Top del día** / **Top de la semana** / **Top del mes** (productos más vendidos)
- **Menos vendidos** (semana y mes separados, excluye stock=0)
- **Productos agotados** y **con stock bajo** (bajo el mínimo configurado)
- Banner de alerta en el dashboard cuando hay productos con bajo stock
- Exportar reportes a Excel

### Importación desde Excel/CSV
- Subir archivo `.csv`, `.xlsx` o `.xls`
- Vista previa con diferencias antes de aplicar
- Alerta si algún producto reduce su stock
- Bitácora de todas las importaciones realizadas
- Descargar plantilla

### Usuarios, Roles y Permisos
- Múltiples usuarios con roles (admin, vendedor, etc.)
- Permisos granulares por módulo + acción (`productos:ver`, `ventas:crear`, etc.)
- Solo admin puede gestionar usuarios, roles y configuración

### Seguridad
- **Rate limiting**: máximo 5 intentos de login por IP en 15 minutos
- **JWT**: tokens firmados con clave secreta, expiración implícita
- **Sentry** (opcional): monitoreo de errores en producción
- Passwords hasheadas con bcryptjs
- Validación de entrada con Zod

### Cloud (Supabase Storage)
- Sincronización automática: la DB se descarga de Supabase al arrancar
- Cada escritura sube la DB actualizada
- Backup periódico cada 15 segundos
- Backup diario con timestamp y retención de 30 días
- Las imágenes de productos se suben a Supabase Storage

### Dark mode
- Botón de alternancia en el header (luna/sol)
- Persistencia en localStorage
- Paleta oscura completa para uso nocturno

### Diseño responsive
- Adaptable a tablets (< 900px) y celulares (< 600px)
- Layout en una columna en móviles
- Tablas y formularios responsivos
- Navegación adaptable

## Despliegue

### Backend (Render)

1. Conecta el repo de GitHub
2. Configura:
   - **Root Directory:** `core`
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
   - **Runtime:** Node
3. Añade las variables de entorno (`.env`) en Render Dashboard
4. Render asigna una URL como `https://papeleriav2.onrender.com`

### Frontend (Vercel)

1. Conecta el repo de GitHub
2. Configura:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Añade variable de entorno:
   - `VITE_API_URL=https://papeleriav2.onrender.com`
4. Vercel asigna una URL como `https://papeleria-v2-frontend-ngph.vercel.app`

### Variables de entorno en producción

| Variable | Dónde | Descripción |
|----------|-------|-------------|
| `PORT` | Render | Puerto del servidor (Render lo asigna) |
| `HOST` | Render | `0.0.0.0` |
| `JWT_SECRET` | Render | Clave secreta para firmar tokens |
| `SUPABASE_URL` | Render | URL de tu proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Render | Service role key de Supabase |
| `SENTRY_DSN` | Render (opcional) | DSN de Sentry para monitoreo |
| `VITE_API_URL` | Vercel | URL del backend en Render |

## Mantenimiento

### Backups
- Los backups diarios se almacenan en el bucket `papeleria-backups` de Supabase
- Se conservan 30 días, los más antiguos se eliminan automáticamente
- También hay respaldo en tiempo real en `papeleria` bucket (la DB activa)

### Si algo falla

1. **Error de conexión**: verifica que el backend esté corriendo en Render
2. **Importación no funciona**: revisa que el archivo tenga las columnas correctas (nombre, precio, cantidad)
3. **Stock incorrecto**: usa "Revertir" en la transacción o ajusta manualmente con movimientos
4. **Login no funciona**: ejecuta `SELECT * FROM usuarios` en la DB para verificar usuarios
5. **Sentry captura errores**: si configuraste `SENTRY_DSN`, los errores aparecen en `sebastian-ramirez.sentry.io`

## Comandos útiles

```bash
# Backend
cd core
npm run dev          # Desarrollo con recarga automática
npm start            # Producción
npm test             # Ejecutar tests
npm run test:watch   # Tests en modo watch

# Frontend
cd frontend
npm run dev          # Desarrollo
npm run build        # Build production
npm run preview      # Vista previa del build
```

## Tecnologías usadas

| Capa | Tecnología |
|------|-----------|
| Backend | Fastify 5, Node.js 22+ |
| Base de datos | SQLite (`node:sqlite`) |
| Autenticación | JWT (`@fastify/jwt`) |
| Validación | Zod |
| Almacenamiento cloud | Supabase Storage |
| Monitoreo | Sentry (opcional) |
| Frontend | React 19, Vite 7 |
| Iconos | Lucide React |
| Tests | Vitest |
| Exportación | xlsx (SheetJS) |
| Imágenes | Jimp (redimensionamiento) |
| Passwords | bcryptjs |
