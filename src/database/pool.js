/**
 * pool.js
 * Pool de conexiones MySQL (uso futuro - Fase backend).
 *
 * Se deja preparado con mysql2/promise. El pool se crea de forma perezosa
 * la primera vez que se solicita, para que el servidor pueda arrancar en
 * esta fase sin necesidad de una base de datos disponible.
 */
const mysql = require('mysql2/promise');
const { dbConfig } = require('../config/database');

let pool = null;

/**
 * getPool
 * Devuelve (creando si es necesario) el pool de conexiones MySQL.
 * NOTA: solo invocar cuando la base de datos esté disponible.
 */
function getPool() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

module.exports = { getPool };
