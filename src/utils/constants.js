/**
 * constants.js
 * Constantes compartidas del backend (estados, operaciones de bitácora, roles).
 */

const ESTADOS = {
  ACTIVO: 'ACTIVO',
  INACTIVO: 'INACTIVO',
  BLOQUEADO: 'BLOQUEADO',
  ABIERTA: 'ABIERTA',
  LIQUIDADA: 'LIQUIDADA',
  ANULADA: 'ANULADA',
  PENDIENTE: 'PENDIENTE',
  PAGADA: 'PAGADA',
};

const OPERACIONES_BITACORA = {
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
};

const ROLES = {
  ADMIN: 'ADMIN',
  OPERADOR: 'OPERADOR',
  CONSULTA: 'CONSULTA',
};

module.exports = { ESTADOS, OPERACIONES_BITACORA, ROLES };
