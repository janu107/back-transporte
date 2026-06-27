/**
 * cors.js
 * Opciones de configuración para CORS.
 * En desarrollo se permite el origen del frontend (Vite).
 */
const env = require('./env');

const allowedOrigins = env.CORS_ORIGIN
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    try {
      return new URL(value).origin;
    } catch {
      return value.replace(/\/+$/, '');
    }
  });

const corsOptions = {
  origin(origin, callback) {
    // Permite clientes sin Origin (curl, health checks y comunicación servidor-servidor).
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);

    const err = new Error(`Origen no permitido por CORS: ${origin}`);
    err.status = 403;
    err.code = 'CORS_ORIGIN_DENIED';
    return callback(err);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  credentials: true,
};

corsOptions.allowedOrigins = allowedOrigins;

module.exports = corsOptions;
