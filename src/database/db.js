/**
 * db.js
 * Helpers de acceso a MySQL sobre el pool (mysql2/promise).
 * Expone query/queryOne/execute y un helper de transacción.
 */
const { getPool } = require('./pool');
const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

function sqlSummary(sql) {
  return String(sql).replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function run(operation, sql, params, fn) {
  const startedAt = process.hrtime.bigint();
  const meta = {
    operation,
    sql: sqlSummary(sql),
    parameterCount: params.length,
  };
  logger.debug('SQL consulta iniciada', meta);

  try {
    const result = await fn();
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.debug('SQL consulta finalizada', {
      ...meta,
      durationMs: Number(durationMs.toFixed(2)),
      rowCount: Array.isArray(result) ? result.length : undefined,
      affectedRows: result?.affectedRows,
      insertId: result?.insertId,
    });
    return result;
  } catch (err) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.error('SQL consulta fallida', {
      ...meta,
      durationMs: Number(durationMs.toFixed(2)),
      error: err,
    });
    throw err;
  }
}

/** Ejecuta una consulta y devuelve todas las filas. */
async function query(sql, params = []) {
  return run('query', sql, params, async () => {
    const [rows] = await getPool().execute(sql, params);
    return rows;
  });
}

/** Ejecuta una consulta y devuelve la primera fila (o null). */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** Ejecuta INSERT/UPDATE/DELETE y devuelve el ResultSetHeader (insertId, affectedRows...). */
async function execute(sql, params = []) {
  return run('execute', sql, params, async () => {
    const [result] = await getPool().execute(sql, params);
    return result;
  });
}

/**
 * withTransaction
 * Ejecuta un callback dentro de una transacción usando una conexión dedicada.
 * @param {(conn) => Promise<any>} fn  recibe la conexión; usar conn.execute(...)
 */
async function withTransaction(fn) {
  const transactionId = randomUUID();
  const conn = await getPool().getConnection();
  logger.debug('SQL transacción iniciada', { transactionId });
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    logger.debug('SQL transacción confirmada', { transactionId });
    return result;
  } catch (err) {
    await conn.rollback();
    logger.error('SQL transacción revertida', { transactionId, error: err });
    throw err;
  } finally {
    conn.release();
    logger.debug('SQL conexión de transacción liberada', { transactionId });
  }
}

module.exports = { query, queryOne, execute, withTransaction };
