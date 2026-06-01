/**
 * role.middleware.js
 * Middleware de autorización por rol (uso futuro - Fase backend).
 *
 * Uso previsto: router.get('/x', authMiddleware, requireRole('ADMIN'), handler)
 */
const { error } = require('../utils/response');

function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    // TODO (Fase backend): validar req.user.rol contra rolesPermitidos.
    // if (!req.user) return error(res, 'No autenticado', 401);
    // if (!rolesPermitidos.includes(req.user.rol)) {
    //   return error(res, 'No autorizado para este recurso', 403);
    // }
    return next();
  };
}

module.exports = requireRole;
