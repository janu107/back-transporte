/**
 * mantenimientos.controller.js
 * CRUD de Mantenimientos. El recurso se resuelve desde :recurso
 * (transportistas, pilotos, camiones, polizas, facturas-vales).
 */
const { byParam } = require('./crud.factory');

module.exports = byParam();
