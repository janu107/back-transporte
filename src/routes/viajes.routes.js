/**
 * viajes.routes.js
 * REGISTRO DE VIAJES (Detalle de Póliza / Envíos).
 *   GET   /viajes                  -> lista de viajes
 *   GET   /viajes/resumen/:idPoliza-> saldo de piezas / viajes realizados / pesos
 *   POST  /viajes                  -> crear (valida saldo y reglas de negocio)
 *   PUT   /viajes/:id              -> actualizar
 *   PATCH /viajes/:id/estado       -> anular
 */
const { Router } = require('express');
const ctrl = require('../controllers/viajes.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/', authMiddleware, ctrl.list);
router.get('/resumen/:idPoliza', authMiddleware, ctrl.resumen);
// [2026-08 §2] Retarifar: tarifas usadas por la póliza y recálculo masivo del valor.
router.get('/poliza/:idPoliza/tarifas', authMiddleware, ctrl.tarifasPoliza);
router.post('/poliza/:idPoliza/retarifar', authMiddleware, ctrl.retarifar);
router.post('/validar', authMiddleware, ctrl.validar);
router.post('/', authMiddleware, ctrl.create);
router.put('/:id', authMiddleware, ctrl.update);
router.patch('/:id/estado', authMiddleware, ctrl.changeEstado);

module.exports = router;
