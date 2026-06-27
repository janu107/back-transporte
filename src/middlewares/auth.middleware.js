/**
 * auth.middleware.js
 * Verifica el JWT del header Authorization: Bearer <token> y expone req.user.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { error } = require('../utils/response');
const logger = require('../utils/logger');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    logger.warn('Autenticación rechazada: falta token', {
      requestId: req.requestId,
      path: req.originalUrl,
    });
    return error(res, 'Token no proporcionado', 401);
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = payload; // { codigo, usuario, nombre, rol }
    return next();
  } catch (e) {
    logger.warn('Autenticación rechazada: token inválido o expirado', {
      requestId: req.requestId,
      path: req.originalUrl,
      reason: e.name,
    });
    return error(res, 'Token inválido o expirado', 401);
  }
}

module.exports = authMiddleware;
