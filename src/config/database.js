/**
 * database.js
 * Configuración de la conexión a MySQL (uso futuro - Fase backend).
 *
 * En esta fase NO se conecta realmente a la base de datos. El pool se crea
 * de forma perezosa (lazy) en ./src/database/pool.js. Aquí se exponen los
 * datos de configuración y una utilidad para probar la conexión cuando
 * se decida activar la persistencia real.
 */
const env = require('./env');

const dbConfig = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
};

/**
 * testConnection
 * Prueba la conexión a MySQL. Pensado para invocarse desde server.js
 * cuando se active la base de datos real.
 */
async function testConnection() {
  // const { getPool } = require('../database/pool');
  // const pool = getPool();
  // const conn = await pool.getConnection();
  // await conn.ping();
  // conn.release();
  // return true;
  throw new Error('Conexión a base de datos no habilitada en esta fase.');
}

module.exports = { dbConfig, testConnection };
