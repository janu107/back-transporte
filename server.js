/**
 * server.js
 * Punto de entrada del backend del Sistema Administrativo de Transporte.
 * Levanta el servidor HTTP usando la app de Express configurada en src/app.js.
 */
require('dotenv').config();

const app = require('./src/app');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');

// NOTA (Fase backend): aquí se podrá verificar la conexión a MySQL antes de
// levantar el servidor usando ./src/config/database.js -> testConnection().
// Por ahora el servidor arranca sin requerir base de datos.

const PORT = env.PORT;

app.listen(PORT, () => {
  logger.info(`Servidor API app_transporte escuchando en http://localhost:${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);
});
