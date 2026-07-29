/**
 * anticipos.controller.js — ANTICIPOS / PROVISIÓN (pro_anticipo_provision).
 */
const service = require('../services/anticipos.service');
const { success, error } = require('../utils/response');

const userOf = (req) => (req.user && req.user.usuario) || 'sistema';

module.exports = {
  async list(req, res, next) {
    try { success(res, await service.listar()); } catch (e) { next(e); }
  },
  // [v7 §5] Reimpresión: busca por número de vale y/o placa.
  async buscarReimpresion(req, res, next) {
    try { success(res, await service.buscarReimpresion(req.query)); }
    catch (e) { if (e.status) return error(res, e.message, e.status); next(e); }
  },
  // [v7 §4] Datos del vale resueltos en servidor para imprimir.
  async impresion(req, res, next) {
    try { success(res, await service.impresion(req.params.id)); }
    catch (e) { if (e.status) return error(res, e.message, e.status); next(e); }
  },
  async create(req, res, next) {
    try {
      const row = await service.crear(req.body, userOf(req));
      success(res, row, 'Anticipo registrado correctamente', 201);
    } catch (e) { next(e); }
  },
  async update(req, res, next) {
    try {
      const row = await service.actualizar(req.params.id, req.body, userOf(req));
      success(res, row, 'Anticipo actualizado correctamente');
    } catch (e) { next(e); }
  },
  async changeEstado(req, res, next) {
    try {
      const row = await service.cambiarEstado(req.params.id, req.body.estado, userOf(req));
      success(res, row, 'Estado actualizado correctamente');
    } catch (e) { next(e); }
  },
};
