# Backend — Sistema Administrativo de Transporte (`back-transporte`)

API REST construida con **Node.js + Express** para la base de datos **`app_transporte`** (MySQL).

> **Fase actual:** estructura base. Solo el endpoint de _health check_ está implementado.
> El resto de endpoints están **planeados y documentados** como stubs (responden `501 Not Implemented`),
> listos para implementarse en la fase de backend.

## Requisitos

- Node.js 18+
- npm 9+
- (Fase futura) MySQL 8

## Instalación y ejecución

```bash
cd back-transporte
npm install
cp .env.example .env   # o copiar manualmente en Windows
npm run dev            # nodemon
# o
npm start              # node
```

Servidor por defecto: `http://localhost:3000`

### Verificación

```
GET http://localhost:3000/api/health
=> { "ok": true, "message": "API app_transporte funcionando" }
```

## Estructura

```
back-transporte/
├── backups/            Respaldos (uso futuro)
├── docs/               Documentación del backend
├── logs/               Logs (uso futuro)
├── scripts/            init-admin.js (creación del admin - futuro)
├── sql/                app_transporte.sql (esquema) y seeds.sql (datos)
├── src/
│   ├── app.js          Configuración de Express (middlewares, rutas, errores)
│   ├── config/         env, cors, database
│   ├── controllers/    Controladores por módulo (stubs en esta fase)
│   ├── database/       pool.js (pool MySQL perezoso)
│   ├── middlewares/    auth, role, error, validate
│   ├── routes/         Rutas por módulo + index.routes.js
│   ├── services/       Lógica de negocio (stubs en esta fase)
│   └── utils/          logger, response, validators, constants
├── temp/
├── .env / .env.example
├── package.json
└── server.js           Punto de entrada
```

## Variables de entorno

| Variable        | Descripción                         | Default                  |
|-----------------|-------------------------------------|--------------------------|
| `PORT`          | Puerto del servidor                 | `3000`                   |
| `DB_HOST`       | Host MySQL (futuro)                 | `localhost`              |
| `DB_USER`       | Usuario MySQL (futuro)              | `root`                   |
| `DB_PASSWORD`   | Contraseña MySQL (futuro)           | _(vacío)_                |
| `DB_NAME`       | Base de datos (futuro)              | `app_transporte`         |
| `JWT_SECRET`    | Secreto para JWT (futuro)           | `change_me`              |
| `CORS_ORIGIN`   | Origen permitido del frontend       | `http://localhost:5173`  |

## Endpoints planeados

Todos bajo el prefijo `/api`:

- **Auth:** `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- **Seguridad:** `/usuarios`, `/roles`, `/usuario-rol`
- **Catálogos:** `/catalogos/:recurso` (tipo-camion, tipo-producto, tipo-anticipo-provision, ubicacion-bomba, productos, bombas, tarifa-embarque)
- **Configuración:** `/configuracion/empresas`, `/configuracion/parametros`
- **Mantenimientos:** `/mantenimientos/:recurso` (transportistas, pilotos, camiones, polizas, facturas-vales)
- **Procesos:** `/procesos/:recurso` (poliza-detalle, anticipo-provision, detalle-facturas, liquidaciones)
- **Bitácoras:** `GET /bitacoras`
- **Health:** `GET /health`

## Pendiente para la fase backend

1. Activar la conexión MySQL (`config/database.js` + `database/pool.js`).
2. Implementar `services/*` con consultas reales y registro en tablas de bitácora.
3. Implementar autenticación JWT real (`auth.middleware.js`, `auth.service.js`).
4. Completar el script `scripts/init-admin.js`.
5. Validaciones con `validate.middleware.js` en cada ruta de escritura.
