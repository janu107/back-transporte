/**
 * detalleFactura.routes.js — DETALLE DE FACTURA (P14).
 *   GET   /detalle-factura              -> lista
 *   GET   /detalle-factura/:id/impresion -> datos resueltos para imprimir el vale
 *   POST  /detalle-factura              -> crear (correlativo + descuenta saldo, transaccional)
 *   PATCH /detalle-factura/:id/estado   -> anular / reactivar
 */
const { Router } = require('express');
const ctrl = require('../controllers/detalleFactura.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/', authMiddleware, ctrl.list);
router.get('/:id/impresion', authMiddleware, ctrl.impresion);
router.post('/', authMiddleware, ctrl.create);
router.patch('/:id/estado', authMiddleware, ctrl.changeEstado);

module.exports = router;
