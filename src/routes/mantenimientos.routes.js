/**
 * mantenimientos.routes.js
 * Rutas del módulo Mantenimientos. El parámetro :recurso identifica el recurso:
 *   transportistas | pilotos | camiones | polizas | facturas-vales
 *
 *   GET    /api/mantenimientos/:recurso
 *   POST   /api/mantenimientos/:recurso
 *   PUT    /api/mantenimientos/:recurso/:id
 *   DELETE /api/mantenimientos/:recurso/:id
 */
const { Router } = require('express');
const ctrl = require('../controllers/mantenimientos.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/:recurso', authMiddleware, ctrl.list);
router.get('/:recurso/:id', authMiddleware, ctrl.getById);
router.post('/:recurso', authMiddleware, ctrl.create);
router.put('/:recurso/:id', authMiddleware, ctrl.update);
router.delete('/:recurso/:id', authMiddleware, ctrl.remove);

module.exports = router;
