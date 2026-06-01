/**
 * auth.middleware.js
 * Middleware de autenticación basado en JWT (uso futuro - Fase backend).
 *
 * En esta fase NO se valida ningún token real. Se deja la estructura lista
 * para verificar el header Authorization: Bearer <token> con jsonwebtoken.
 */
const { error } = require('../utils/response');

function authMiddleware(req, res, next) {
  // TODO (Fase backend): verificar token JWT.
  // const header = req.headers.authorization || '';
  // const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  // if (!token) return error(res, 'Token no proporcionado', 401);
  // try {
  //   const payload = jwt.verify(token, env.JWT_SECRET);
  //   req.user = payload;
  //   return next();
  // } catch (e) {
  //   return error(res, 'Token inválido o expirado', 401);
  // }

  // Por ahora se deja pasar todas las peticiones (fase de maquetado).
  return next();
}

module.exports = authMiddleware;
