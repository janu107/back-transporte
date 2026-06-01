/**
 * configuracion.routes.js
 * Rutas del módulo Configuración (con_empresas, con_parametros).
 *   GET    /api/configuracion/empresas
 *   POST   /api/configuracion/empresas
 *   PUT    /api/configuracion/empresas/:id
 *   DELETE /api/configuracion/empresas/:id
 *   GET    /api/configuracion/parametros
 *   PUT    /api/configuracion/parametros   (fila única codigo=1)
 */
const { Router } = require('express');
const ctrl = require('../controllers/configuracion.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/empresas', authMiddleware, ctrl.listEmpresas);
router.post('/empresas', authMiddleware, ctrl.createEmpresa);
router.put('/empresas/:id', authMiddleware, ctrl.updateEmpresa);
router.delete('/empresas/:id', authMiddleware, ctrl.removeEmpresa);

router.get('/parametros', authMiddleware, ctrl.getParametros);
router.put('/parametros', authMiddleware, ctrl.updateParametros);

module.exports = router;
