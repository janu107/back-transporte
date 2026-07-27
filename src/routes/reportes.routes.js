/**
 * reportes.routes.js — REPORTES.
 *   GET /reportes/diesel?tipo&valor&estado_poliza&fecha_ini&fecha_fin
 */
const { Router } = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const reporteDiesel = require('../services/reporteDiesel.service');
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

module.exports = router;
