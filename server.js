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

async function start() {
  try {
    await testConnection();
    logger.info(`Conexión a MySQL OK (${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME})`);
  } catch (err) {
    logger.warn(`No se pudo conectar a MySQL: ${err.message}`);
    logger.warn('El servidor arrancará igualmente, pero los endpoints que usan la BD fallarán.');
    logger.warn('Verifica que MySQL esté activo y que la base "app_transporte" exista (sql/app_transporte.sql).');
  }

  app.listen(PORT, () => {
    logger.info(`Servidor API app_transporte escuchando en http://localhost:${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/api/health`);
  });
}

start();
