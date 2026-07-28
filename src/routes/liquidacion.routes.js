/**
 * liquidacion.routes.js — LIQUIDACIÓN DE PÓLIZAS.
 *   GET  /liquidacion/resumen/:id_poliza
 *   POST /liquidacion/confirmar   body { id_poliza }
 */
const { Router } = require('express');
const ctrl = require('../controllers/liquidacion.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/resumen/:id_poliza', authMiddleware, ctrl.resumen);
router.get('/historial', authMiddleware, ctrl.historial);
router.get('/detalle/:id_poliza', authMiddleware, ctrl.detallePoliza);
router.get('/reporte/:id_poliza', authMiddleware, ctrl.reporteDetallado);
router.post('/confirmar', authMiddleware, ctrl.confirmar);

module.exports = router;
