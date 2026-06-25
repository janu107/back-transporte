/**
 * auth.controller.js
 * Endpoints de autenticación:
 *   POST /api/auth/login   { usuario, contrasena } -> { token, user }
 *   GET  /api/auth/me      (requiere token) -> user
 *   POST /api/auth/logout
 */
const authService = require('../services/auth.service');
const { queryOne } = require('../database/db');
const { success, error } = require('../utils/response');

module.exports = {
  async login(req, res, next) {
    try {
      const { usuario, contrasena } = req.body;
      const { token, user } = await authService.login(usuario, contrasena);
      success(res, { token, user }, 'Inicio de sesión exitoso');
    } catch (e) {
      if (e.status) return error(res, e.message, e.status);
      next(e);
    }
  },

  async me(req, res, next) {
    try {
      // req.user lo establece auth.middleware a partir del token.
      const u = await queryOne(
        'SELECT codigo, usuario, nombre, correo, estado, debe_cambiar_pwd FROM adm_usuarios WHERE codigo = ?',
        [req.user.codigo]
      );
      if (!u) return error(res, 'Usuario no encontrado', 404);
      success(res, { ...u, rol: req.user.rol });
    } catch (e) { next(e); }
  },

  async logout(req, res) {
    // Con JWT sin estado, el logout se maneja en el cliente (borrar token).
    success(res, null, 'Sesión cerrada');
  },
};
