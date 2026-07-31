/**
 * detalleFactura.controller.js — DETALLE DE FACTURA (P14, pro_detalle_facturas).
 */
const service = require('../services/detalleFactura.service');
const { success, error } = require('../utils/response');

const userOf = (req) => (req.user && req.user.usuario) || 'sistema';

module.exports = {
  async list(req, res, next) {
    try { success(res, await service.listar()); } catch (e) { next(e); }
  },
  async create(req, res, next) {
    try {
      const row = await service.crear(req.body, userOf(req));
      success(res, row, 'Vale registrado correctamente', 201);
    } catch (e) { next(e); }
  },
  async changeEstado(req, res, next) {
    try {
      const row = await service.cambiarEstado(req.params.id, req.body.estado, userOf(req));
      success(res, row, 'Estado actualizado correctamente');
    } catch (e) { next(e); }
  },

  /** GET /detalle-factura/:id/impresion — [v5] datos listos para imprimir el vale. */
  async impresion(req, res, next) {
    try { success(res, await service.impresion(req.params.id)); } catch (e) { next(e); }
  },
  /** GET /detalle-factura/por-api/:apiId — [v8] vale(s) generado(s) al confirmar un despacho. */
  async impresionPorApi(req, res, next) {
    try { success(res, await service.impresionPorApi(req.params.apiId)); }
    catch (e) { if (e.status) return error(res, e.message, e.status); next(e); }
  },
  /** GET /detalle-factura/reimpresion?vale=&placa= — [v8] reimpresión por vale/placa. */
  async buscarReimpresion(req, res, next) {
    try { success(res, await service.buscarReimpresion(req.query)); }
    catch (e) { if (e.status) return error(res, e.message, e.status); next(e); }
  },
};
