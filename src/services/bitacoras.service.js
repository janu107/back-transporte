/**
 * bitacoras.service.js
 * Lógica de negocio de Bitácoras / Auditoría - uso futuro.
 * Consolidará las tablas de bitácora (Bxxx_*) con filtros por módulo, operación,
 * usuario y rango de fechas.
 */
// const { getPool } = require('../database/pool');

async function listar(filtros = {}) {
  throw new Error('bitacoras.service.listar no implementado en esta fase.');
}

module.exports = { listar };
