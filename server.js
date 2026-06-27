/**
 * server.js
 * Punto de entrada del backend. Verifica la conexión a MySQL (sin abortar si falla)
 * y levanta el servidor HTTP.
 */
require('dotenv').config();

const app = require('./src/app');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');
const { testConnection } = require('./src/config/database');

const PORT = env.PORT;
let server;

async function checkDatabase() {
  try {
    await testConnection();
    logger.info('Conexión a MySQL verificada', {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
    });
  } catch (err) {
    logger.error('No se pudo conectar a MySQL; los endpoints de datos fallarán', {
      error: err,
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
    });
  }
}

function start() {
  logger.info('Iniciando API app_transporte', {
    environment: env.NODE_ENV,
    port: PORT,
    database: `${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`,
    corsOrigins: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  });

  // El HTTP queda disponible de inmediato; la prueba de BD no bloquea el arranque.
  server = app.listen(PORT, () => {
    logger.info('Servidor HTTP listo', {
      url: `http://localhost:${PORT}`,
      healthCheck: `http://localhost:${PORT}/api/health`,
      pid: process.pid,
    });
    checkDatabase();
  });

  server.on('error', (err) => {
    const hint = err.code === 'EADDRINUSE'
      ? `El puerto ${PORT} ya está ocupado. Cierra la otra instancia o cambia PORT en .env.`
      : undefined;
    logger.fatal('No se pudo iniciar el servidor HTTP', { error: err, port: PORT, hint });
    process.exitCode = 1;
  });
}

function shutdown(signal) {
  logger.info('Apagando API', { signal });
  if (!server) return process.exit(0);
  server.close((err) => {
    if (err) {
      logger.error('Error al cerrar el servidor HTTP', { error: err });
      return process.exit(1);
    }
    logger.info('Servidor HTTP cerrado correctamente');
    return process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('Promesa rechazada sin manejar', { error: reason });
});
process.on('uncaughtException', (err) => {
  logger.fatal('Excepción no controlada', { error: err });
  process.exit(1);
});

start();
