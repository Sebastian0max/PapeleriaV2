# Plan: Sistema de Inventario para Papelería
### Fase 1 (Local) → Fase 2 (Multi-tenant en VPS)

---

## 1. Visión general

El sistema se construye **una sola vez** con una arquitectura que sirve para dos escenarios sin reescribir código:

1. **Fase 1 – Local:** un instalador único que se ejecuta en la PC de la papelería, sin internet, con su propia base de datos SQLite.
2. **Fase 2 – Multi-tenant en VPS:** el mismo backend, ahora expuesto en internet, sirviendo a múltiples papelerías, cada una con su propia base SQLite aislada.

La clave para lograr esto sin duplicar trabajo es separar el **núcleo de negocio** (lógica, API, acceso a datos) del **transporte** (cómo se ejecuta y se empaqueta). Este documento detalla ambas partes.

---

## 2. Arquitectura de carpetas (monorepo)

```
sistema-papeleria/
│
├── core/                  # Lógica de negocio + API (Fastify) + acceso SQLite
│   ├── src/
│   │   ├── routes/        # login, productos, ventas, movimientos, reportes
│   │   ├── services/      # reglas de negocio (stock, ventas, roles)
│   │   ├── db/            # conexión SQLite, migraciones, queries
│   │   └── auth/          # JWT, bcrypt, roles
│   └── package.json
│
├── frontend/               # React + Vite + Tailwind (login, dashboard, stock)
│   ├── src/
│   └── package.json
│
├── desktop/                 # Empaquetado LOCAL (Electron)
│   ├── main.js              # arranca 'core' como proceso interno
│   └── electron-builder.yml
│
├── server/                  # Empaquetado VPS (multi-tenant)
│   ├── tenant-resolver.js   # resuelve subdominio -> archivo .db
│   ├── Dockerfile
│   └── docker-compose.yml
│
└── shared/                   # Tipos, validaciones y constantes compartidas
```

**Por qué esto resuelve tu pregunta del instalador único:** `core` y `frontend` se escriben **una sola vez**. Lo único que cambia entre Fase 1 y Fase 2 es la "cáscara" que los envuelve (`desktop` vs `server`). No hay dos sistemas, hay un sistema con dos empaques.

---

## 3. Fase 1 — Instalador local (papelería individual)

### 3.1 Propuesta de empaquetado: **Electron + electron-builder**

Es la opción que mejor resuelve "un solo instalador" para un negocio no técnico:

- Se genera **un único archivo `.exe`** (Windows, con NSIS) o `.dmg` (Mac) que el dueño de la papelería descarga e instala con doble clic.
- Adentro va todo: el motor Node.js, el backend (`core`), el frontend ya compilado (`frontend`), y SQLite embebido (`better-sqlite3`).
- No requiere que el usuario instale Node, ni configure nada, ni tenga internet.
- La base de datos SQLite se crea automáticamente en la carpeta de datos del usuario (`%APPDATA%/SistemaPapeleria/data.db` en Windows) en el primer arranque.
- Login, roles, productos, ventas y reportes (tus 3 pantallas) funcionan 100% offline.

### 3.2 Por qué Electron y no otras opciones

| Opción | Un solo instalador | Offline | Curva de trabajo | Apto para no-técnicos |
|---|---|---|---|---|
| **Electron + electron-builder** | Sí (.exe único) | Sí | Media | Sí — doble clic e instala |
| Node.js + `pkg`/`nexe` (exe sin UI) | Sí, pero sin ventana propia | Sí | Baja | No — hay que abrir navegador manualmente |
| App web + XAMPP/WAMP | No, requiere instalar 2-3 cosas | Sí | Alta para el usuario final | No |
| PWA instalable | Requiere servidor corriendo igual | Parcial | Media | Regular |

Si prefieres evitar Electron por tamaño del instalador (~80-150MB), la alternativa más simple es **Node + `pkg`** generando un `.exe` que levanta el servidor local y abre el navegador por defecto automáticamente en `http://localhost:PUERTO`. Es más liviano, pero la experiencia es un poco menos "app nativa". Ambas opciones son válidas; Electron da mejor experiencia, `pkg` da menor tamaño y menos complejidad de build.

### 3.3 Actualizaciones futuras

Con `electron-updater` puedes, más adelante, distribuir actualizaciones automáticas del instalador sin que el cliente tenga que reinstalar manualmente — útil incluso en la fase local, y reutilizable en la fase VPS para el frontend.

---

## 4. Fase 2 — Multi-tenant en VPS

Cuando decidas exponerlo en internet para múltiples papelerías, **reutilizas `core` y `frontend` tal cual**, y solo agregas la capa `server`:

### 4.1 Patrón de datos: una base SQLite por tenant

- Base de datos central pequeña (`registry.db`) con: tenants, subdominios, plan, ruta al archivo `.db` de cada uno.
- Cada papelería tiene su propio archivo: `tenants/empresa1.db`, `tenants/empresa2.db`, etc.
- Un middleware (`tenant-resolver.js`) identifica el tenant por subdominio (`empresa1.tudominio.com`) o por el token del usuario, y abre la conexión al archivo correspondiente.
- Aislamiento total: un problema en la base de una empresa no afecta a las demás.

### 4.2 Empaquetado: Docker + docker-compose

- Un único `Dockerfile` construye la imagen con `core` + `server`.
- Un único `docker-compose.yml` levanta: la app, Nginx (reverse proxy y SSL), y el volumen persistente donde viven los archivos `.db`.
- Desplegar o actualizar se reduce a: `docker compose up -d --build`. Este es tu "instalador" equivalente para el VPS — un solo comando, reproducible en cualquier servidor.

### 4.3 Infraestructura sugerida

| Elemento | Recomendación |
|---|---|
| VPS | 2 vCPU / 4GB RAM / 60-80GB SSD (Hetzner, DigitalOcean o Vultr) |
| Proxy | Nginx con Let's Encrypt (SSL gratis, auto-renovable) |
| Backups | Litestream replicando cada `.db` a S3/Backblaze en casi tiempo real |
| Contenedores | Docker + docker-compose |

Con esta configuración, un solo VPS soporta cómodamente 30-50 papelerías pequeñas antes de necesitar escalar horizontalmente o migrar los tenants más pesados a un servidor propio.

---

## 5. Roles de acceso (aplica en ambas fases)

- **Super Admin** (solo en Fase 2): administra altas/bajas de empresas y planes.
- **Admin de empresa:** gestiona usuarios, ve todos los reportes.
- **Vendedor:** usa el botón "Vender" de tu wireframe, ve stock pero no lo edita.
- **Bodega/Inventario:** usa el botón "Agregar", controla entradas y salidas de mercadería.

---

## 6. Modelo de datos (resumen)

- `usuarios` (id, usuario, password_hash, rol)
- `productos` (id, nombre, cantidad_stock, precio, categoría)
- `movimientos` (id, producto_id, tipo: entrada/salida, cantidad, usuario_id, fecha)
- `ventas` (id, producto_id, cantidad, total, fecha, usuario_id)

Los reportes de tu pantalla "3. STOCK" (top del día/semana/mes, agotados, menos vendidos) se resuelven con consultas agregadas sobre `ventas` y `movimientos`, indexadas por fecha y producto — no se necesitan tablas adicionales.

---

## 7. Roadmap actualizado

| Fase | Contenido | Duración estimada |
|---|---|---|
| 0 | Definir esquema final de datos y cerrar diseño de pantallas | 1 semana |
| 1 | Construir `core` (API + SQLite) y `frontend` (login, dashboard, stock) | 3-4 semanas |
| 2 | Empaquetar `desktop` con Electron, generar instalador `.exe`, probar en la papelería | 1-2 semanas |
| 3 | Validar en uso real con el negocio, ajustar reportes y flujo de ventas | 2-4 semanas (uso real) |
| 4 | Construir capa `server` (multi-tenant, resolver de subdominios) | 2 semanas |
| 5 | Dockerizar, levantar VPS, Nginx + SSL, Litestream para backups | 1 semana |
| 6 | (Opcional) Módulo de planes y cobros por tenant si se vende como SaaS | 1-2 semanas |

---

## 8. Próximos pasos sugeridos

1. Cerrar el esquema SQL exacto (tablas, tipos de dato, índices).
2. Definir el flujo de "Vender" con más detalle (¿descuenta stock automáticamente? ¿permite anular una venta?).
3. Elegir entre Electron o `pkg` para el instalador local, según si priorizas experiencia de usuario o tamaño del instalador.
4. Empezar el desarrollo de `core` y `frontend` en paralelo, manteniendo la separación de carpetas descrita en la sección 2 desde el día uno — esto es lo que evita reescribir código al llegar a la Fase 2.
