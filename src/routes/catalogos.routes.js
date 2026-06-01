/**
 * catalogos.routes.js
 * Rutas del módulo Catálogos. El parámetro :recurso identifica el catálogo:
 *   tipo-camion | tipo-producto | tipo-anticipo-provision | ubicacion-bomba |
 *   productos | bombas | tarifa-embarque
 *
 *   GET    /api/catalogos/:recurso
 *   POST   /api/catalogos/:recurso
 *   PUT    /api/catalogos/:recurso/:id
 *   DELETE /api/catalogos/:recurso/:id
 */
const { Router } = require('express');
const ctrl = require('../controllers/catalogos.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/:recurso', authMiddleware, ctrl.list);
router.get('/:recurso/:id', authMiddleware, ctrl.getById);
router.post('/:recurso', authMiddleware, ctrl.create);
router.put('/:recurso/:id', authMiddleware, ctrl.update);
router.delete('/:recurso/:id', authMiddleware, ctrl.remove);

module.exports = router;
