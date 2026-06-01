/**
 * catalogos.controller.js
 * Controlador de Catálogos - uso futuro.
 *
 * Sub-recursos: tipo-camion, tipo-producto, tipo-anticipo-provision,
 * ubicacion-bomba, productos, bombas, tarifa-embarque.
 *
 * Endpoints planeados (por sub-recurso):
 *   GET /api/catalogos/:recurso   POST /api/catalogos/:recurso
 *   PUT /api/catalogos/:recurso/:id   DELETE /api/catalogos/:recurso/:id
 */
const { error } = require('../utils/response');

const noImpl = (name) => (req, res) =>
  error(res, `Endpoint catalogos.${name} no implementado en esta fase.`, 501);

module.exports = {
  list: noImpl('list'),
  getById: noImpl('getById'),
  create: noImpl('create'),
  update: noImpl('update'),
  remove: noImpl('remove'),
};
