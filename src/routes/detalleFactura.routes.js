/**
 * detalleFactura.routes.js — DETALLE DE FACTURA (P14).
 *   GET   /detalle-factura            -> lista
 *   POST  /detalle-factura            -> crear (correlativo + descuenta saldo, transaccional)
 *   PATCH /detalle-factura/:id/estado -> anular / reactivar
 */
const { Router } = require('express');
const ctrl = require('../controllers/detalleFactura.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/', authMiddleware, ctrl.list);
router.post('/', authMiddleware, ctrl.create);
router.patch('/:id/estado', authMiddleware, ctrl.changeEstado);

module.exports = router;
