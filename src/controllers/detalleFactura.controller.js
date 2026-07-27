/**
 * detalleFactura.controller.js — DETALLE DE FACTURA (P14, pro_detalle_facturas).
 */
const service = require('../services/detalleFactura.service');
const { success } = require('../utils/response');

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
};
