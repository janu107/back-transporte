/**
 * cors.js
 * Opciones de configuración para CORS.
 * En desarrollo se permite el origen del frontend (Vite).
 */
const env = require('./env');

const corsOptions = {
  origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

module.exports = corsOptions;
