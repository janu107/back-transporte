/**
 * roles.controller.js
 * CRUD de Roles (adm_roles) y asignaciones Usuario-Rol (adm_usuario_rol).
 * Para usuario-rol, la lista incluye el nombre de usuario y el tipo de rol (JOIN).
 */
const { byFixed } = require('./crud.factory');
const crud = require('../services/crud.service');
const { getResource } = require('../config/resources');
const { query } = require('../database/db');
const { success, error } = require('../utils/response');

const rolesHandlers = byFixed('roles');
const userOf = (req) => (req.user && req.user.usuario) || 'sistema';

module.exports = {
  // ---- Roles ----
  list: rolesHandlers.list,
  getById: rolesHandlers.getById,
  create: rolesHandlers.create,
  update: rolesHandlers.update,
  changeEstado: rolesHandlers.changeEstado,

  // ---- Usuario-Rol ----
  async listUsuarioRol(req, res, next) {
    try {
      const rows = await query(
        `SELECT ur.codigo, ur.id_usuario, ur.id_rol, ur.estado,
                u.usuario, u.nombre AS nombre_usuario,
                r.tipo_rol AS rol
           FROM adm_usuario_rol ur
           JOIN adm_usuarios u ON u.codigo = ur.id_usuario
           JOIN adm_roles r ON r.codigo = ur.id_rol
          ORDER BY ur.codigo DESC`
      );
      success(res, rows);
    } catch (e) { next(e); }
  },

  async createUsuarioRol(req, res, next) {
    try {
      const def = getResource('usuario-rol');
      const row = await crud.create(def, req.body, userOf(req));
      success(res, row, 'Asignación creada correctamente', 201);
    } catch (e) { next(e); }
  },

  async updateUsuarioRol(req, res, next) {
    try {
      const def = getResource('usuario-rol');
      const row = await crud.update(def, req.params.id, req.body, userOf(req));
      success(res, row, 'Asignación actualizada correctamente');
    } catch (e) { next(e); }
  },

  async changeEstadoUsuarioRol(req, res, next) {
    try {
      const def = getResource('usuario-rol');
      const row = await crud.patchEstado(def, req.params.id, req.body.estado, userOf(req));
      success(res, row, 'Estado actualizado correctamente');
    } catch (e) { next(e); }
  },
};
