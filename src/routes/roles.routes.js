/**
 * roles.routes.js
 * Rutas del módulo Roles (adm_roles).
 *   GET   /api/roles
 *   POST  /api/roles
 *   PUT   /api/roles/:id
 *   PATCH /api/roles/:id/estado
 *
 * Las asignaciones usuario-rol se montan en index.routes.js bajo /api/usuario-rol.
 */
const { Router } = require('express');
const ctrl = require('../controllers/roles.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/', authMiddleware, ctrl.list);
router.get('/:id', authMiddleware, ctrl.getById);
router.post('/', authMiddleware, ctrl.create);
router.put('/:id', authMiddleware, ctrl.update);
router.patch('/:id/estado', authMiddleware, ctrl.changeEstado);

module.exports = router;
