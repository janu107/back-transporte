/**
 * roles.controller.js
 * CRUD de Roles (adm_roles) y asignaciones Usuario-Rol (adm_usuario_rol).
 * Para usuario-rol, la lista incluye el nombre de usuario y el tipo de rol (JOIN).
 */
const { byFixed } = require('./crud.factory');
const crud = require('../services/crud.service');
const { getResource } = require('../config/resources');
const { query, queryOne, execute } = require('../database/db');
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

  /**
   * GET /usuario-rol/por-usuario — un renglón por usuario con TODOS sus roles.
   * Alimenta la pantalla de asignación múltiple.
   */
  async listPorUsuario(req, res, next) {
    try {
      const rows = await query(
        `SELECT u.codigo AS id_usuario, u.usuario, u.nombre AS nombre_usuario, u.estado AS estado_usuario,
                GROUP_CONCAT(CASE WHEN UPPER(ur.estado) = 'ACTIVO' THEN r.tipo_rol END
                             ORDER BY r.tipo_rol SEPARATOR ', ') AS roles,
                COUNT(CASE WHEN UPPER(ur.estado) = 'ACTIVO' THEN 1 END) AS total_roles
           FROM adm_usuarios u
           LEFT JOIN adm_usuario_rol ur ON ur.id_usuario = u.codigo
           LEFT JOIN adm_roles r ON r.codigo = ur.id_rol
          GROUP BY u.codigo, u.usuario, u.nombre, u.estado
          ORDER BY u.usuario`
      );
      success(res, rows.map((r) => ({
        ...r,
        roles: r.roles ? r.roles.split(', ') : [],
      })));
    } catch (e) { next(e); }
  },

  /**
   * PUT /usuario-rol/usuario/:idUsuario — reemplaza el juego de roles de un
   * usuario en una sola operación: activa los enviados y desactiva el resto.
   * Se conservan las filas existentes (no se borran) para no perder la
   * trazabilidad de quién asignó qué.
   */
  async asignarRoles(req, res, next) {
    try {
      const idUsuario = Number(req.params.idUsuario);
      if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
        return error(res, 'Usuario no válido.', 400);
      }
      const usuario = await queryOne('SELECT codigo FROM adm_usuarios WHERE codigo = ?', [idUsuario]);
      if (!usuario) return error(res, 'El usuario no existe.', 404);

      const pedidos = [...new Set((req.body.roles || []).map(Number).filter(Boolean))];
      if (pedidos.length) {
        const marcadores = pedidos.map(() => '?').join(',');
        const existentes = await query(
          `SELECT codigo FROM adm_roles WHERE codigo IN (${marcadores})`, pedidos
        );
        if (existentes.length !== pedidos.length) {
          return error(res, 'Alguno de los roles seleccionados no existe.', 400);
        }
      }

      const actuales = await query(
        'SELECT codigo, id_rol, estado FROM adm_usuario_rol WHERE id_usuario = ?', [idUsuario]
      );
      const porRol = new Map(actuales.map((a) => [Number(a.id_rol), a]));
      const user = userOf(req);

      // Alta o reactivación de los seleccionados.
      for (const idRol of pedidos) {
        const fila = porRol.get(idRol);
        if (!fila) {
          // eslint-disable-next-line no-await-in-loop
          await execute(
            'INSERT INTO adm_usuario_rol (id_usuario, id_rol, estado, usuario_graba) VALUES (?,?,?,?)',
            [idUsuario, idRol, 'ACTIVO', user]
          );
        } else if (String(fila.estado).toUpperCase() !== 'ACTIVO') {
          // eslint-disable-next-line no-await-in-loop
          await execute(
            'UPDATE adm_usuario_rol SET estado = ?, usuario_graba = ? WHERE codigo = ?',
            ['ACTIVO', user, fila.codigo]
          );
        }
      }

      // Baja de los que ya no vienen.
      for (const fila of actuales) {
        if (!pedidos.includes(Number(fila.id_rol)) && String(fila.estado).toUpperCase() === 'ACTIVO') {
          // eslint-disable-next-line no-await-in-loop
          await execute(
            'UPDATE adm_usuario_rol SET estado = ?, usuario_graba = ? WHERE codigo = ?',
            ['INACTIVO', user, fila.codigo]
          );
        }
      }

      const roles = await query(
        `SELECT r.tipo_rol FROM adm_usuario_rol ur
           JOIN adm_roles r ON r.codigo = ur.id_rol
          WHERE ur.id_usuario = ? AND UPPER(ur.estado) = 'ACTIVO'
          ORDER BY r.tipo_rol`,
        [idUsuario]
      );
      return success(res, {
        id_usuario: idUsuario,
        roles: roles.map((r) => r.tipo_rol),
      }, roles.length
        ? `Roles actualizados: ${roles.map((r) => r.tipo_rol).join(', ')}.`
        : 'El usuario quedó sin roles asignados.');
    } catch (e) { return next(e); }
  },
};
