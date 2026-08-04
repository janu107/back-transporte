/**
 * configuracion.service.js
 * Helpers de Configuración reutilizables por otros módulos.
 * Tablas: con_empresas, con_parametros (fila única codigo=1).
 */
const { queryOne } = require('../database/db');

// Factor por defecto de la fórmula del valor (kg->lb) si el parámetro no existe.
const FACTOR_DEFECTO = 0.022046;

/**
 * Devuelve el "Porcentaje de pagos" (con_parametros.codigo=1) como número.
 * Es el FACTOR de la fórmula del valor de envío:
 *   VALOR = peso(kg) × porcentaje_pagos × tarifa.
 * Si no hay fila o el valor es 0/NULL, cae al factor por defecto 0.022046.
 * @returns {Promise<number>}
 */
async function obtenerPorcentajePagos() {
  try {
    const row = await queryOne('SELECT porcentaje_pagos FROM con_parametros WHERE codigo = 1');
    const v = Number(row && row.porcentaje_pagos);
    return Number.isFinite(v) && v > 0 ? v : FACTOR_DEFECTO;
  } catch {
    return FACTOR_DEFECTO;
  }
}

module.exports = { obtenerPorcentajePagos, FACTOR_DEFECTO };
