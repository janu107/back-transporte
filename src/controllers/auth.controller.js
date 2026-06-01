/**
 * auth.controller.js
 * Controlador de autenticación (uso futuro - Fase backend).
 *
 * Endpoints planeados:
 *   POST /api/auth/login   -> recibe { usuario, contrasena } y devuelve { token, user }
 *   GET  /api/auth/me      -> devuelve el usuario autenticado (requiere token)
 *   POST /api/auth/logout  -> invalida la sesión / token
 *
 * En esta fase la autenticación real vive en el frontend (mock con localStorage).
 */
const { success, error } = require('../utils/response');

async function login(req, res) {
  // TODO (Fase backend): validar credenciales contra adm_usuarios, generar JWT.
  return error(res, 'Endpoint /auth/login no implementado en esta fase.', 501);
}

async function me(req, res) {
  // TODO (Fase backend): devolver datos del usuario a partir de req.user (token).
  return error(res, 'Endpoint /auth/me no implementado en esta fase.', 501);
}

async function logout(req, res) {
  // TODO (Fase backend): manejo de logout (lista negra de tokens / sesión).
  return success(res, null, 'Logout simulado (sin persistencia en esta fase).');
}

module.exports = { login, me, logout };
