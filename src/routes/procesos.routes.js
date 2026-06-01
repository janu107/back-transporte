/**
 * procesos.routes.js
 * Rutas del módulo Procesos. El parámetro :recurso identifica el recurso:
 *   poliza-detalle | anticipo-provision | detalle-facturas | liquidaciones
 *
 *   GET    /api/procesos/:recurso
 *   POST   /api/procesos/:recurso
 *   PUT    /api/procesos/:recurso/:id
 *   DELETE /api/procesos/:recurso/:id
 */
const { Router } = require('express');
const ctrl = require('../controllers/procesos.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/:recurso', authMiddleware, ctrl.list);
router.get('/:recurso/:id', authMiddleware, ctrl.getById);
router.post('/:recurso', authMiddleware, ctrl.create);
router.put('/:recurso/:id', authMiddleware, ctrl.update);
router.delete('/:recurso/:id', authMiddleware, ctrl.remove);

module.exports = router;
