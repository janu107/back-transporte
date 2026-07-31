/**
 * role.middleware.js — [v8] CONTROL DE ACCESO POR ROL.
 *
 * Se aplica DESPUÉS de auth.middleware (que expone req.user con { rol }).
 * Política de módulos (ver index.routes.js):
 *   ADMIN     -> todo
 *   OPERADOR  -> Catálogos (lectura/escritura) + Procesos; Mantenimientos solo lectura
 *   CONSULTOR -> Catálogos solo lectura + Dashboard
 */
const { error } = require('../utils/response');

const rolDe = (req) => String(req.user && req.user.rol ? req.user.rol : '').toUpperCase();

/** Permite el acceso a ADMIN y a los roles indicados; cualquier otro -> 403. */
function permitirRoles(...roles) {
  const permitidos = new Set(['ADMIN', ...roles.map((r) => String(r).toUpperCase())]);
  return (req, res, next) => {
    if (permitidos.has(rolDe(req))) return next();
    return error(res, 'No tiene permisos para acceder a este recurso.', 403);
  };
}

/** Los roles indicados solo pueden LEER (GET/HEAD); cualquier escritura -> 403. */
function soloLecturaPara(...roles) {
  const restringidos = new Set(roles.map((r) => String(r).toUpperCase()));
  return (req, res, next) => {
    if (restringidos.has(rolDe(req)) && !['GET', 'HEAD'].includes(req.method)) {
      return error(res, 'Su rol solo permite consultar este recurso.', 403);
    }
    return next();
  };
}

// Compat: requireRole('ADMIN', ...) equivale a permitirRoles(...).
const requireRole = permitirRoles;

module.exports = { permitirRoles, soloLecturaPara, requireRole };
