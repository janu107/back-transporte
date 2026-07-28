/**
 * dashboard.routes.js — [v5 §5] Datos agregados para las gráficas del dashboard.
 *   GET /dashboard/factura-activa-diesel
 *   GET /dashboard/poliza-activa-viajes
 */
const { Router } = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const svc = require('../services/dashboard.service');
const { success } = require('../utils/response');

const router = Router();

router.get('/factura-activa-diesel', authMiddleware, async (req, res, next) => {
  try { success(res, await svc.facturaActivaDiesel()); } catch (e) { next(e); }
});

router.get('/poliza-activa-viajes', authMiddleware, async (req, res, next) => {
  try { success(res, await svc.polizaActivaViajes()); } catch (e) { next(e); }
});

module.exports = router;
