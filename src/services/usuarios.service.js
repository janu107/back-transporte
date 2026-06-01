/**
 * usuarios.service.js
 * Lógica de negocio del módulo Usuarios (adm_usuarios) - uso futuro.
 * Consultas a MySQL y registro en bitácora (Badm_usuarios) se implementarán aquí.
 */
// const { getPool } = require('../database/pool');

async function listar() {
  throw new Error('usuarios.service.listar no implementado en esta fase.');
}
async function obtenerPorId(id) {
  throw new Error('usuarios.service.obtenerPorId no implementado en esta fase.');
}
async function crear(data) {
  throw new Error('usuarios.service.crear no implementado en esta fase.');
}
async function actualizar(id, data) {
  throw new Error('usuarios.service.actualizar no implementado en esta fase.');
}

module.exports = { listar, obtenerPorId, crear, actualizar };
