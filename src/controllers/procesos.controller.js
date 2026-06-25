/**
 * procesos.controller.js
 * CRUD de Procesos. El recurso se resuelve desde :recurso
 * (poliza-detalle, anticipo-provision, detalle-facturas, liquidaciones).
 */
const { byParam } = require('./crud.factory');

module.exports = byParam();
