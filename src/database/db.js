/**
 * db.js
 * Helpers de acceso a MySQL sobre el pool (mysql2/promise).
 * Expone query/queryOne/execute y un helper de transacción.
 */
const { getPool } = require('./pool');

/** Ejecuta una consulta y devuelve todas las filas. */
async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/** Ejecuta una consulta y devuelve la primera fila (o null). */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** Ejecuta INSERT/UPDATE/DELETE y devuelve el ResultSetHeader (insertId, affectedRows...). */
async function execute(sql, params = []) {
  const [result] = await getPool().execute(sql, params);
  return result;
}

/**
 * withTransaction
 * Ejecuta un callback dentro de una transacción usando una conexión dedicada.
 * @param {(conn) => Promise<any>} fn  recibe la conexión; usar conn.execute(...)
 */
async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { query, queryOne, execute, withTransaction };
