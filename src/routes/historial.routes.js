/**
 * historial.routes.js — [v6 §3] HISTORIAL (tablas his_*).
 *   GET /historial/:tipo?fecha_inicio&fecha_fin&q&page&limit
 *   tipo ∈ det-poliza | val-detalle | anticipo-efectivo
 */
const { Router } = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const historial = require('../services/historial.service');
const { success, error } = require('../utils/response');

const router = Router();

router.get('/:tipo', authMiddleware, async (req, res, next) => {
  try {
    success(res, await historial.consultar(req.params.tipo, req.query));
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    next(e);
  }
});

module.exports = router;
