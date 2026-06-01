/**
 * mantenimientos.service.js
 * Lógica de negocio de Mantenimientos - uso futuro.
 * Tablas: man_transportista, man_pilotos, man_camion, man_poliza, man_facturas_vales.
 */
// const { getPool } = require('../database/pool');

async function listar(recurso) {
  throw new Error(`mantenimientos.service.listar(${recurso}) no implementado en esta fase.`);
}
async function crear(recurso, data) {
  throw new Error(`mantenimientos.service.crear(${recurso}) no implementado en esta fase.`);
}
async function actualizar(recurso, id, data) {
  throw new Error(`mantenimientos.service.actualizar(${recurso}) no implementado en esta fase.`);
}
async function eliminar(recurso, id) {
  throw new Error(`mantenimientos.service.eliminar(${recurso}) no implementado en esta fase.`);
}

module.exports = { listar, crear, actualizar, eliminar };
