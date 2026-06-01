/**
 * bitacoras.controller.js
 * Controlador de Bitácoras / Auditoría - uso futuro.
 *
 * Endpoint planeado:
 *   GET /api/bitacoras?modulo=&operacion=&usuario=&fechaInicio=&fechaFin=
 *   Consolida las tablas Bxxx_* (bitácora) del esquema app_transporte.
 */
const { error } = require('../utils/response');

const noImpl = (name) => (req, res) =>
  error(res, `Endpoint bitacoras.${name} no implementado en esta fase.`, 501);

module.exports = {
  list: noImpl('list'),
};
