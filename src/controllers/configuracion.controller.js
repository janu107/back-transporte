/**
 * configuracion.controller.js
 * Controlador de Configuración: empresas (con_empresas) y parámetros (con_parametros) - uso futuro.
 *
 * Endpoints planeados:
 *   GET /api/configuracion/empresas   POST ...   PUT .../:id   DELETE .../:id
 *   GET /api/configuracion/parametros   PUT /api/configuracion/parametros (fila única codigo=1)
 */
const { error } = require('../utils/response');

const noImpl = (name) => (req, res) =>
  error(res, `Endpoint configuracion.${name} no implementado en esta fase.`, 501);

module.exports = {
  listEmpresas: noImpl('listEmpresas'),
  createEmpresa: noImpl('createEmpresa'),
  updateEmpresa: noImpl('updateEmpresa'),
  removeEmpresa: noImpl('removeEmpresa'),
  getParametros: noImpl('getParametros'),
  updateParametros: noImpl('updateParametros'),
};
