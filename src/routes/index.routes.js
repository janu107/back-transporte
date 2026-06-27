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
const bitacorasRoutes = require('./bitacoras.routes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/roles', rolesRoutes);
router.use('/catalogos', catalogosRoutes);
router.use('/configuracion', configuracionRoutes);
router.use('/mantenimientos', mantenimientosRoutes);
router.use('/procesos', procesosRoutes);
router.use('/control-api', controlApiRoutes);
router.use('/bitacoras', bitacorasRoutes);

// NOTA: las asignaciones usuario-rol se exponen también bajo /usuario-rol
const rolesController = require('../controllers/roles.controller');
router.get('/usuario-rol', rolesController.listUsuarioRol);
router.post('/usuario-rol', rolesController.createUsuarioRol);
router.put('/usuario-rol/:id', rolesController.updateUsuarioRol);
router.patch('/usuario-rol/:id/estado', rolesController.changeEstadoUsuarioRol);

module.exports = router;
