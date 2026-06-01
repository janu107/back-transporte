/**
 * configuracion.service.js
 * Lógica de negocio de Configuración - uso futuro.
 * Tablas: con_empresas, con_parametros (fila única codigo=1).
 */
// const { getPool } = require('../database/pool');

async function listarEmpresas() {
  throw new Error('configuracion.service.listarEmpresas no implementado en esta fase.');
}
async function getParametros() {
  throw new Error('configuracion.service.getParametros no implementado en esta fase.');
}
async function actualizarParametros(data) {
  throw new Error('configuracion.service.actualizarParametros no implementado en esta fase.');
}

module.exports = { listarEmpresas, getParametros, actualizarParametros };
