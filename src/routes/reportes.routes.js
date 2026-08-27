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
const reporteTransportista = require('../services/reporteTransportista.service');
const reporteViajesPoliza = require('../services/reporteViajesPoliza.service');
const reportePolizasPendientes = require('../services/reportePolizasPendientes.service');
const reporteAnticiposPoliza = require('../services/reporteAnticiposPoliza.service');
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

// Reporte por transportista: resumen de sus pólizas activas.
router.get('/transportista/lista', authMiddleware, async (req, res, next) => {
  try {
    success(res, await reporteTransportista.transportistas());
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    next(e);
  }
});

router.get('/transportista', authMiddleware, async (req, res, next) => {
  try {
    success(res, await reporteTransportista.porTransportista(req.query));
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    next(e);
  }
});

// Matriz de pólizas activas contra los transportistas que trabajan en cada una.
router.get('/polizas-transportistas', authMiddleware, async (req, res, next) => {
  try {
    success(res, await reporteTransportista.resumenPolizasTransportistas());
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

// [2026-08 §10] Pólizas pendientes por liquidar (filtro por estados).
router.get('/polizas-pendientes', authMiddleware, async (req, res, next) => {
  try {
    success(res, await reportePolizasPendientes.generar(req.query));
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    next(e);
  }
});

// [2026-08 §11] Anticipos a transportistas por póliza / arrastre.
router.get('/anticipos-poliza', authMiddleware, async (req, res, next) => {
  try {
    success(res, await reporteAnticiposPoliza.generar(req.query));
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    next(e);
  }
});

module.exports = router;
