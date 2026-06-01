/**
 * catalogos.service.js
 * Lógica de negocio de Catálogos - uso futuro.
 * Tablas: cat_tipo_camion, cat_tipo_producto, cat_tipo_anticipo_provision,
 * cat_ubicacion_bomba, cat_productos, cat_bombas, cat_tarifa_embarque.
 */
// const { getPool } = require('../database/pool');

async function listar(recurso) {
  throw new Error(`catalogos.service.listar(${recurso}) no implementado en esta fase.`);
}
async function crear(recurso, data) {
  throw new Error(`catalogos.service.crear(${recurso}) no implementado en esta fase.`);
}
async function actualizar(recurso, id, data) {
  throw new Error(`catalogos.service.actualizar(${recurso}) no implementado en esta fase.`);
}
async function eliminar(recurso, id) {
  throw new Error(`catalogos.service.eliminar(${recurso}) no implementado en esta fase.`);
}

module.exports = { listar, crear, actualizar, eliminar };
