/**
 * anticipos.controller.js — ANTICIPOS / PROVISIÓN (pro_anticipo_provision).
 */
const service = require('../services/anticipos.service');
const { success } = require('../utils/response');

const userOf = (req) => (req.user && req.user.usuario) || 'sistema';

module.exports = {
  async list(req, res, next) {
    try { success(res, await service.listar()); } catch (e) { next(e); }
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
