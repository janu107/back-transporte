/**
 * controlApi.routes.js
 * Rutas del módulo CONTROL DEL API (Confirmación de Vales).
 *   GET  /control-api/pendientes   -> vales en estado 'P'
 *   POST /control-api/confirmar    -> ejecuta sp_confirmar_despacho_api
 */
const { Router } = require('express');
const ctrl = require('../controllers/controlApi.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/pendientes', authMiddleware, ctrl.pendientes);
router.post('/confirmar', authMiddleware, ctrl.confirmar);

module.exports = router;
