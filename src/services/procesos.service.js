/**
 * procesos.service.js
 * Lógica de negocio de Procesos - uso futuro.
 * Tablas: pro_poliza_detalle, pro_anticipo_provision, pro_detalle_facturas, pro_liquidaciones.
 */
// const { getPool } = require('../database/pool');

async function listar(recurso) {
  throw new Error(`procesos.service.listar(${recurso}) no implementado en esta fase.`);
}
async function crear(recurso, data) {
  throw new Error(`procesos.service.crear(${recurso}) no implementado en esta fase.`);
}
async function actualizar(recurso, id, data) {
  throw new Error(`procesos.service.actualizar(${recurso}) no implementado en esta fase.`);
}
async function eliminar(recurso, id) {
  throw new Error(`procesos.service.eliminar(${recurso}) no implementado en esta fase.`);
}

module.exports = { listar, crear, actualizar, eliminar };
