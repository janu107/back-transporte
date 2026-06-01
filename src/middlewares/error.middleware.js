/**
 * error.middleware.js
 * Middlewares para manejo de rutas no encontradas (404) y de errores.
 */
const logger = require('../utils/logger');

/**
 * notFoundHandler
 * Responde 404 para cualquier ruta no registrada.
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    ok: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * errorHandler
 * Middleware central de errores. Debe registrarse al final de la cadena.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  logger.error(err.message || 'Error no controlado', err.stack);

  res.status(status).json({
    ok: false,
    message: err.message || 'Error interno del servidor',
    details: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
}

module.exports = { notFoundHandler, errorHandler };
