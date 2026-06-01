/**
 * roles.controller.js
 * Controlador del módulo de Roles (adm_roles) y asignaciones (adm_usuario_rol) - uso futuro.
 *
 * Endpoints planeados:
 *   GET   /api/roles            POST /api/roles            PUT /api/roles/:id    PATCH /api/roles/:id/estado
 *   GET   /api/usuario-rol      POST /api/usuario-rol      PUT /api/usuario-rol/:id   PATCH /api/usuario-rol/:id/estado
 */
const { error } = require('../utils/response');

const noImpl = (name) => (req, res) =>
  error(res, `Endpoint roles.${name} no implementado en esta fase.`, 501);

module.exports = {
  list: noImpl('list'),
  getById: noImpl('getById'),
  create: noImpl('create'),
  update: noImpl('update'),
  changeEstado: noImpl('changeEstado'),
  // Asignaciones usuario-rol
  listUsuarioRol: noImpl('listUsuarioRol'),
  createUsuarioRol: noImpl('createUsuarioRol'),
  updateUsuarioRol: noImpl('updateUsuarioRol'),
  changeEstadoUsuarioRol: noImpl('changeEstadoUsuarioRol'),
};
