/**
 * esquema.js — Consultas sobre el esquema real de la base.
 *
 * El servidor de producción es un HÍBRIDO: sigue el modelo oficial en unas tablas
 * y conserva columnas antiguas en otras. Por eso ninguna consulta debe suponer
 * que una columna existe: se pregunta al catálogo y se arma el SQL en función de
 * la respuesta. El resultado se memoriza porque el esquema no cambia mientras
 * vive el proceso.
 *
 * (liquidacionV2.service.js tiene su propia copia de estos ayudantes, anterior a
 * este módulo; el código nuevo debe usar este.)
 */
const { queryOne } = require('../database/db');

const columnaCache = new Map();
const tablaCache = new Map();

/** ¿Existe la columna en el esquema actual? */
function existeColumna(tabla, columna) {
  const clave = `${tabla}.${columna}`;
  if (!columnaCache.has(clave)) {
    columnaCache.set(clave, queryOne(
      `SELECT COUNT(*) AS total
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tabla, columna]
    ).then((row) => Number(row?.total || 0) > 0).catch(() => false));
  }
  return columnaCache.get(clave);
}

/** ¿Existe la tabla en el esquema actual? */
function existeTabla(tabla) {
  if (!tablaCache.has(tabla)) {
    tablaCache.set(tabla, queryOne(
      `SELECT COUNT(*) AS total FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tabla]
    ).then((row) => Number(row?.total || 0) > 0).catch(() => false));
  }
  return tablaCache.get(tabla);
}

/**
 * Expresión SQL del transportista de un detalle (viaje o vale). Si la tabla
 * tiene su propia columna se prefiere esa; si no, se resuelve por el camión.
 */
async function sqlTransportistaDe(tabla, aliasDetalle, aliasCamion) {
  return (await existeColumna(tabla, 'id_transportista'))
    ? `COALESCE(${aliasDetalle}.id_transportista, ${aliasCamion}.id_transportista)`
    : `${aliasCamion}.id_transportista`;
}

/**
 * Condición SQL de "registro vigente" para una tabla que puede o no tener la
 * columna `estado`. Cuando no existe, todas las filas cuentan.
 * Se toma como vigente lo que NO está anulado; sin estado grabado se considera
 * activo, que es el valor por omisión de la columna.
 */
async function sqlActivo(tabla, alias) {
  if (!(await existeColumna(tabla, 'estado'))) return '1 = 1';
  const col = alias ? `${alias}.estado` : 'estado';
  return `UPPER(COALESCE(${col}, 'ACTIVO')) NOT IN ('ANULADO', 'ANULADA')`;
}

module.exports = { existeColumna, existeTabla, sqlTransportistaDe, sqlActivo };
