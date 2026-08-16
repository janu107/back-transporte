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

// Autenticación + autorización por matriz de permisos (config/permisos.js).
const auth = require('../middlewares/auth.middleware');
const { autorizar } = require('../middlewares/role.middleware');

const router = Router();

// Públicos
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// A partir de aquí TODO exige sesión y pasa por la matriz de permisos, que
// resuelve el módulo según la URL y valida el rol y la operación (SELECT /
// INSERT / UPDATE / DELETE). Lo que no esté mapeado se niega por defecto.
router.use(auth, autorizar);

router.use('/usuarios', usuariosRoutes);
router.use('/roles', rolesRoutes);
router.use('/configuracion', configuracionRoutes);
router.use('/reportes', reportesRoutes);
router.use('/historial', historialRoutes);
router.use('/bitacoras', bitacorasRoutes);
router.use('/catalogos', catalogosRoutes);
router.use('/mantenimientos', mantenimientosRoutes);
router.use('/procesos', procesosRoutes);
router.use('/control-api', controlApiRoutes);
router.use('/viajes', viajesRoutes);
router.use('/anticipos', anticiposRoutes);
router.use('/liquidacion', liquidacionRoutes);
router.use('/detalle-factura', detalleFacturaRoutes);
router.use('/dashboard', dashboardRoutes);

// Las asignaciones usuario-rol también se exponen bajo /usuario-rol.
const rolesController = require('../controllers/roles.controller');
router.get('/usuario-rol', rolesController.listUsuarioRol);
// Vista por usuario y asignación de varios roles de una sola vez.
router.get('/usuario-rol/por-usuario', rolesController.listPorUsuario);
router.put('/usuario-rol/usuario/:idUsuario', rolesController.asignarRoles);
router.post('/usuario-rol', rolesController.createUsuarioRol);
router.put('/usuario-rol/:id', rolesController.updateUsuarioRol);
router.patch('/usuario-rol/:id/estado', rolesController.changeEstadoUsuarioRol);

module.exports = router;
