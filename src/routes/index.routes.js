/**
 * index.routes.js
 * Agrupa y monta todas las rutas de la API bajo el prefijo /api (definido en app.js).
 */
const { Router } = require('express');

const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const usuariosRoutes = require('./usuarios.routes');
const rolesRoutes = require('./roles.routes');
const catalogosRoutes = require('./catalogos.routes');
const configuracionRoutes = require('./configuracion.routes');
const mantenimientosRoutes = require('./mantenimientos.routes');
const procesosRoutes = require('./procesos.routes');
const controlApiRoutes = require('./controlApi.routes');
const viajesRoutes = require('./viajes.routes');
const anticiposRoutes = require('./anticipos.routes');
const liquidacionRoutes = require('./liquidacion.routes');
const detalleFacturaRoutes = require('./detalleFactura.routes');
const reportesRoutes = require('./reportes.routes');
const dashboardRoutes = require('./dashboard.routes');
const historialRoutes = require('./historial.routes');
const bitacorasRoutes = require('./bitacoras.routes');

// [v8] Autenticación + autorización por rol a nivel de módulo.
const auth = require('../middlewares/auth.middleware');
const { permitirRoles, soloLecturaPara } = require('../middlewares/role.middleware');

const router = Router();

// Públicos
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// Seguridad / Configuración / Auditoría / Historial / Reportes -> solo ADMIN
router.use('/usuarios', auth, permitirRoles(), usuariosRoutes);
router.use('/roles', auth, permitirRoles(), rolesRoutes);
router.use('/configuracion', auth, permitirRoles(), configuracionRoutes);
router.use('/reportes', auth, permitirRoles(), reportesRoutes);
router.use('/historial', auth, permitirRoles(), historialRoutes);
router.use('/bitacoras', auth, permitirRoles(), bitacorasRoutes);

// Catálogos -> ADMIN + OPERADOR (escritura); CONSULTOR solo lectura
router.use('/catalogos', auth, permitirRoles('OPERADOR', 'CONSULTOR'), soloLecturaPara('CONSULTOR'), catalogosRoutes);

// Mantenimientos -> ADMIN (escritura); OPERADOR solo lectura (para los combos de Procesos)
router.use('/mantenimientos', auth, permitirRoles('OPERADOR'), soloLecturaPara('OPERADOR'), mantenimientosRoutes);

// Procesos -> ADMIN + OPERADOR
router.use('/procesos', auth, permitirRoles('OPERADOR'), procesosRoutes);
router.use('/control-api', auth, permitirRoles('OPERADOR'), controlApiRoutes);
router.use('/viajes', auth, permitirRoles('OPERADOR'), viajesRoutes);
router.use('/anticipos', auth, permitirRoles('OPERADOR'), anticiposRoutes);
router.use('/liquidacion', auth, permitirRoles('OPERADOR'), liquidacionRoutes);
router.use('/detalle-factura', auth, permitirRoles('OPERADOR'), detalleFacturaRoutes);

// Dashboard -> todos los roles (es la pantalla de inicio)
router.use('/dashboard', auth, permitirRoles('OPERADOR', 'CONSULTOR'), dashboardRoutes);

// NOTA: las asignaciones usuario-rol se exponen también bajo /usuario-rol -> solo ADMIN
const rolesController = require('../controllers/roles.controller');
router.get('/usuario-rol', auth, permitirRoles(), rolesController.listUsuarioRol);
router.post('/usuario-rol', auth, permitirRoles(), rolesController.createUsuarioRol);
router.put('/usuario-rol/:id', auth, permitirRoles(), rolesController.updateUsuarioRol);
router.patch('/usuario-rol/:id/estado', auth, permitirRoles(), rolesController.changeEstadoUsuarioRol);

module.exports = router;
