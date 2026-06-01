/**
 * usuarios.controller.js
 * Controlador del módulo de Usuarios (adm_usuarios) - uso futuro.
 *
 * Endpoints planeados:
 *   GET    /api/usuarios
 *   POST   /api/usuarios
 *   PUT    /api/usuarios/:id
 *   PATCH  /api/usuarios/:id/estado
 *   PATCH  /api/usuarios/:id/password
 */
const { error } = require('../utils/response');

const noImpl = (name) => (req, res) =>
  error(res, `Endpoint usuarios.${name} no implementado en esta fase.`, 501);

module.exports = {
  list: noImpl('list'),
  getById: noImpl('getById'),
  create: noImpl('create'),
  update: noImpl('update'),
  changeEstado: noImpl('changeEstado'),
  changePassword: noImpl('changePassword'),
};
