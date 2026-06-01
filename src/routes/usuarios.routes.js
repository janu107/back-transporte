/**
 * usuarios.routes.js
 * Rutas del módulo Usuarios (adm_usuarios).
 *   GET   /api/usuarios
 *   POST  /api/usuarios
 *   PUT   /api/usuarios/:id
 *   PATCH /api/usuarios/:id/estado
 *   PATCH /api/usuarios/:id/password
 */
const { Router } = require('express');
const ctrl = require('../controllers/usuarios.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

// En la fase backend se aplicará authMiddleware a estas rutas.
router.get('/', authMiddleware, ctrl.list);
router.get('/:id', authMiddleware, ctrl.getById);
router.post('/', authMiddleware, ctrl.create);
router.put('/:id', authMiddleware, ctrl.update);
router.patch('/:id/estado', authMiddleware, ctrl.changeEstado);
router.patch('/:id/password', authMiddleware, ctrl.changePassword);

module.exports = router;
