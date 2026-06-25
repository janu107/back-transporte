/**
 * database.js
 * Configuración de la conexión a MySQL y prueba de conexión.
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
  dateStrings: true, // devuelve fechas como string (evita desfases de zona horaria)
};

/**
 * testConnection
 * Verifica que el pool puede conectarse a MySQL. Devuelve true o lanza error.
 */
async function testConnection() {
  const { getPool } = require('../database/pool');
  const conn = await getPool().getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

module.exports = { dbConfig, testConnection };
