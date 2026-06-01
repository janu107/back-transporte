/**
 * procesos.controller.js
 * Controlador de Procesos - uso futuro.
 *
 * Sub-recursos: poliza-detalle, anticipo-provision, detalle-facturas, liquidaciones.
 *
 * Endpoints planeados (por sub-recurso):
 *   GET /api/procesos/:recurso   POST /api/procesos/:recurso
 *   PUT /api/procesos/:recurso/:id   DELETE /api/procesos/:recurso/:id
 */
const { error } = require('../utils/response');

const noImpl = (name) => (req, res) =>
  error(res, `Endpoint procesos.${name} no implementado en esta fase.`, 501);

module.exports = {
  list: noImpl('list'),
  getById: noImpl('getById'),
  create: noImpl('create'),
  update: noImpl('update'),
  remove: noImpl('remove'),
};
