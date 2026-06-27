/**
 * Registra el inicio y final de cada petición HTTP con un identificador común.
 */
const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const requestId = req.get('x-request-id') || randomUUID();
  const startedAt = process.hrtime.bigint();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  logger.info('HTTP solicitud recibida', {
    requestId,
    method: req.method,
    path: req.originalUrl,
    origin: req.get('origin') || undefined,
    ip: req.ip,
    userAgent: req.get('user-agent') || undefined,
  });

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const meta = {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      contentLength: res.getHeader('content-length') || undefined,
      user: req.user?.usuario || undefined,
    };

    if (res.statusCode >= 500) logger.error('HTTP solicitud finalizada', meta);
    else if (res.statusCode >= 400) logger.warn('HTTP solicitud finalizada', meta);
    else logger.info('HTTP solicitud finalizada', meta);
  });

  req.on('aborted', () => {
    logger.warn('HTTP solicitud abortada por el cliente', {
      requestId,
      method: req.method,
      path: req.originalUrl,
    });
  });

  next();
}

module.exports = requestLogger;
