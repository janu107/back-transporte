/**
 * catalogos.controller.js
 * CRUD de Catálogos. El recurso se resuelve desde :recurso
 * (tipo-camion, tipo-producto, tipo-anticipo-provision, ubicacion-bomba,
 *  productos, bombas, tarifa-embarque).
 */
const { byParam } = require('./crud.factory');

module.exports = byParam();
