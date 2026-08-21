/**
 * viajes.routes.js
 * REGISTRO DE VIAJES (Detalle de Póliza / Envíos).
 *   GET   /viajes                  -> lista de viajes
 *   GET   /viajes/resumen/:idPoliza-> saldo de piezas / viajes realizados / pesos
 *   POST  /viajes                  -> crear (valida saldo y reglas de negocio)
 *   PUT   /viajes/:id              -> actualizar
 *   PATCH /viajes/:id/estado       -> anular
 *   PATCH /viajes/:id/peso         -> corregir el peso (recalcula el valor)
 */
const { Router } = require('express');
const ctrl = require('../controllers/viajes.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/', authMiddleware, ctrl.list);
router.get('/resumen/:idPoliza', authMiddleware, ctrl.resumen);
// [2026-08 §2] Retarifar: tarifas usadas por la póliza y recálculo masivo del valor.
router.get('/poliza/:idPoliza/tarifas', authMiddleware, ctrl.tarifasPoliza);
router.get('/poliza/:idPoliza/transportistas', authMiddleware, ctrl.transportistasPoliza);
router.get('/poliza/:idPoliza/puntos', authMiddleware, ctrl.puntosPoliza);
router.post('/poliza/:idPoliza/retarifar', authMiddleware, ctrl.retarifar);
router.post('/validar', authMiddleware, ctrl.validar);
// [V9 §1] Carga masiva de viajes locales (vista previa y aplicación).
router.post('/carga-masiva', authMiddleware, ctrl.cargaMasiva);
router.post('/', authMiddleware, ctrl.create);
router.put('/:id', authMiddleware, ctrl.update);
router.patch('/:id/estado', authMiddleware, ctrl.changeEstado);
// Solo el peso: tiene permiso propio, para que los roles operativos puedan
// corregirlo sin quedar habilitados a editar el resto del envío.
router.patch('/:id/peso', authMiddleware, ctrl.actualizarPeso);

module.exports = router;
