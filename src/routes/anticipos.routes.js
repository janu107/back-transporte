/**
 * anticipos.routes.js — ANTICIPOS / PROVISIÓN.
 *   GET   /anticipos            -> lista
 *   POST  /anticipos            -> crear (correlativo AÑO+00000, estado ACTIVO)
 *   PUT   /anticipos/:id        -> actualizar
 *   PATCH /anticipos/:id/estado -> anular / activar
 */
const { Router } = require('express');
const ctrl = require('../controllers/anticipos.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/', authMiddleware, ctrl.list);
router.post('/', authMiddleware, ctrl.create);
router.put('/:id', authMiddleware, ctrl.update);
router.patch('/:id/estado', authMiddleware, ctrl.changeEstado);

module.exports = router;
