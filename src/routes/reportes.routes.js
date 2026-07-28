/**
 * reportes.routes.js — REPORTES.
 *   GET /reportes/diesel?tipo&valor&estado_poliza&fecha_ini&fecha_fin
 *   GET /reportes/arrastre-polizas?poliza_id&punto_embarque_id&fecha_inicio&fecha_fin
 *   GET /reportes/viajes-poliza?poliza_id&transportista_id&nit
 */
const { Router } = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const reporteDiesel = require('../services/reporteDiesel.service');
const reporteArrastre = require('../services/reporteArrastre.service');
const reporteViajesPoliza = require('../services/reporteViajesPoliza.service');
const { success, error } = require('../utils/response');

const router = Router();

router.get('/diesel', authMiddleware, async (req, res, next) => {
  try {
    success(res, await reporteDiesel.generar(req.query));
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    next(e);
  }
});

router.get('/arrastre-polizas', authMiddleware, async (req, res, next) => {
  try {
    success(res, await reporteArrastre.generar(req.query));
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    next(e);
  }
});

router.get('/viajes-poliza', authMiddleware, async (req, res, next) => {
  try {
    success(res, await reporteViajesPoliza.generar(req.query));
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    next(e);
  }
});

module.exports = router;
