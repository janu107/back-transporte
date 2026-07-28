/**
 * liquidacion.controller.js — LIQUIDACIÓN DE PÓLIZAS.
 *   GET  /liquidacion/resumen/:id_poliza  -> resumen por transportista (sin guardar)
 *   POST /liquidacion/confirmar           -> confirma y cierra la póliza
 */
const service = require('../services/liquidacion.service');
const { success, error } = require('../utils/response');

const userOf = (req) => (req.user && req.user.usuario) || 'sistema';

module.exports = {
  async resumen(req, res, next) {
    try {
      const data = await service.resumenPoliza(req.params.id_poliza);
      success(res, { ...data, mensaje: 'Resumen generado correctamente' });
    } catch (e) {
      if (e.status) return error(res, e.message, e.status);
      next(e);
    }
  },

  async historial(req, res, next) {
    try { success(res, await service.historial(req.query)); }
    catch (e) { if (e.status) return error(res, e.message, e.status); next(e); }
  },

  async detallePoliza(req, res, next) {
    try { success(res, await service.detallePoliza(req.params.id_poliza)); }
    catch (e) { if (e.status) return error(res, e.message, e.status); next(e); }
  },

  async reporteDetallado(req, res, next) {
    try { success(res, await service.reporteDetallado(req.params.id_poliza)); }
    catch (e) { if (e.status) return error(res, e.message, e.status); next(e); }
  },

  async confirmar(req, res, next) {
    try {
      // El usuario se toma de la sesión (token), NO del body.
      const r = await service.confirmar(req.body.id_poliza, userOf(req));
      success(res, r, r.mensaje);
    } catch (e) {
      if (e.status) return error(res, e.message, e.status);
      next(e);
    }
  },
};
