/**
 * mantenimientos.routes.js
 * Rutas del módulo Mantenimientos. :recurso =
 *   transportistas | pilotos | camiones | polizas | facturas-vales
 */
const { Router } = require('express');
const ctrl = require('../controllers/mantenimientos.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/:recurso', authMiddleware, ctrl.list);
// Va antes de /:recurso/:id, o «estados» se tomaría como el id de un registro.
router.get('/:recurso/estados', authMiddleware, ctrl.estados);
router.get('/:recurso/:id', authMiddleware, ctrl.getById);
router.post('/:recurso', authMiddleware, ctrl.create);
router.put('/:recurso/:id', authMiddleware, ctrl.update);
router.patch('/:recurso/:id/estado', authMiddleware, ctrl.changeEstado);
router.delete('/:recurso/:id', authMiddleware, ctrl.remove);

module.exports = router;
