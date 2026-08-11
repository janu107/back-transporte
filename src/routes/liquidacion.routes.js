/**
 * liquidacion.routes.js — LIQUIDACIÓN DE PÓLIZAS.
 *   GET  /liquidacion/resumen/:id_poliza
 *   POST /liquidacion/confirmar   body { id_poliza }
 */
const { Router } = require('express');
const ctrl = require('../controllers/liquidacion.controller');
const ctrlV2 = require('../controllers/liquidacionV2.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/role.middleware');

const router = Router();

// Módulo v2 definido en la especificación del 6 de agosto de 2026.
router.get('/v2/polizas-disponibles', authMiddleware, ctrlV2.polizasDisponibles);
router.get('/v2/vista-previa/:id_poliza', authMiddleware, ctrlV2.vistaPrevia);
router.post('/v2/generar', authMiddleware, ctrlV2.generar);
router.get('/v2/historial', authMiddleware, ctrlV2.historial);
router.get('/v2/reversibles', authMiddleware, permitirRoles(), ctrlV2.reversibles);
router.post('/v2/revertir/:id_liquidacion', authMiddleware, permitirRoles(), ctrlV2.revertir);
router.get('/v2/detalle/:id_liquidacion', authMiddleware, ctrlV2.detalle);
router.get('/v2/sobregiros', authMiddleware, ctrlV2.sobregiros);
// [V9 §7] Detalle de sobregiros por liquidación y transportista (solo consulta).
router.get('/v2/sobregiros/detalle', authMiddleware, ctrlV2.sobregirosDetalle);
router.get('/v2/sobregiros/:id_transportista/abonos', authMiddleware, ctrlV2.abonos);
router.post('/v2/abonos', authMiddleware, ctrlV2.registrarAbono);
router.get('/v2/reporte-liquidaciones', authMiddleware, ctrlV2.reporte);
// Reportes que se consultan desde el Historial de liquidaciones.
router.get('/v2/reporte-detallado/:id_liquidacion', authMiddleware, ctrlV2.reporteDetallado);
router.get('/v2/resumen-transportista', authMiddleware, ctrlV2.resumenTransportista);

router.get('/resumen/:id_poliza', authMiddleware, ctrl.resumen);
router.get('/historial', authMiddleware, ctrl.historial);
router.get('/detalle/:id_poliza', authMiddleware, ctrl.detallePoliza);
router.get('/reporte/:id_poliza', authMiddleware, ctrl.reporteDetallado);
router.post('/confirmar', authMiddleware, ctrl.confirmar);

module.exports = router;
