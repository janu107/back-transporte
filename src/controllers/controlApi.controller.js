/**
 * controlApi.controller.js
 * Controlador del módulo CONTROL DEL API (Confirmación de Vales).
 */
const service = require('../services/controlApi.service');
const { success } = require('../utils/response');

const userOf = (req) => (req.user && req.user.usuario) || 'sistema';

module.exports = {
  /** GET /control-api/pendientes — vales en estado 'P'. */
  async pendientes(req, res, next) {
    try {
      success(res, await service.listarPendientes());
    } catch (e) {
      next(e);
    }
  },

  /** POST /control-api/confirmar — ejecuta sp_confirmar_despacho_api. */
  async confirmar(req, res, next) {
    try {
      const resultado = await service.confirmar(req.body, userOf(req));
      success(res, resultado, resultado.mensaje);
    } catch (e) {
      next(e);
    }
  },
};
