/**
 * mantenimientos.controller.js
 * Controlador de Mantenimientos - uso futuro.
 *
 * Sub-recursos: transportistas, pilotos, camiones, polizas, facturas-vales.
 *
 * Endpoints planeados (por sub-recurso):
 *   GET /api/mantenimientos/:recurso   POST /api/mantenimientos/:recurso
 *   PUT /api/mantenimientos/:recurso/:id   DELETE /api/mantenimientos/:recurso/:id
 */
const { error } = require('../utils/response');

const noImpl = (name) => (req, res) =>
  error(res, `Endpoint mantenimientos.${name} no implementado en esta fase.`, 501);

module.exports = {
  list: noImpl('list'),
  getById: noImpl('getById'),
  create: noImpl('create'),
  update: noImpl('update'),
  remove: noImpl('remove'),
};
