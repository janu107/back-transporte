/**
 * viajes.controller.js
 * REGISTRO DE VIAJES (Detalle de Póliza / Envíos) sobre pro_poliza_detalle.
 */
const service = require('../services/viajes.service');
const { success } = require('../utils/response');

const userOf = (req) => (req.user && req.user.usuario) || 'sistema';

module.exports = {
  /** GET /viajes — lista de viajes. */
  async list(req, res, next) {
    try {
      success(res, await service.listar());
    } catch (e) { next(e); }
  },

  /** GET /viajes/resumen/:idPoliza — saldo de piezas, viajes realizados y pesos. */
  async resumen(req, res, next) {
    try {
      success(res, await service.resumenPoliza(req.params.idPoliza));
    } catch (e) { next(e); }
  },

  /** POST /viajes/validar — valida piezas vs saldo y calcula el valor (M2). */
  async validar(req, res, next) {
    try {
      success(res, await service.validarCalcular(req.body));
    } catch (e) { next(e); }
  },

  /** POST /viajes — crea un viaje (valida saldo, póliza abierta, piloto/transportista). */
  async create(req, res, next) {
    try {
      const row = await service.crear(req.body, userOf(req));
      success(res, row, 'Viaje registrado correctamente', 201);
    } catch (e) { next(e); }
  },

  /** PUT /viajes/:id — actualiza un viaje. */
  async update(req, res, next) {
    try {
      const row = await service.actualizar(req.params.id, req.body, userOf(req));
      success(res, row, 'Viaje actualizado correctamente');
    } catch (e) { next(e); }
  },

  /** PATCH /viajes/:id/estado — cambia el estado (anular). */
  async changeEstado(req, res, next) {
    try {
      const row = await service.cambiarEstado(req.params.id, req.body.estado, userOf(req));
      success(res, row, 'Estado actualizado correctamente');
    } catch (e) { next(e); }
  },

  /** GET /viajes/poliza/:idPoliza/tarifas — tarifas usadas por los envíos de la póliza. */
  async tarifasPoliza(req, res, next) {
    try {
      success(res, await service.tarifasDePoliza(req.params.idPoliza));
    } catch (e) { next(e); }
  },

  /** POST /viajes/poliza/:idPoliza/retarifar — recalcula el valor de los envíos con una tarifa. */
  async retarifar(req, res, next) {
    try {
      const r = await service.retarifarPoliza(
        req.params.idPoliza, req.body.id_tarifa_embarque, req.body.nueva_tarifa, userOf(req)
      );
      success(res, r, `Se actualizaron ${r.actualizados} envío(s).`);
    } catch (e) { next(e); }
  },
};
