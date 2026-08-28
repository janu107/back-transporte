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

/**
 * Lo que ACEPTA la columna `estado` de una tabla, leído del catálogo:
 *   { valores: ['A','B'] | null, longitud: 20 | null }
 * `valores` solo viene cuando la columna es un ENUM; en un VARCHAR manda la
 * longitud. Devuelve null si la tabla no tiene columna `estado`.
 */
const estadoCache = new Map();
function estadoDeTabla(tabla) {
  if (!estadoCache.has(tabla)) {
    estadoCache.set(tabla, queryOne(
      `SELECT COLUMN_TYPE AS tipo FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'estado'`,
      [tabla]
    ).then((row) => {
      const tipo = String(row?.tipo || '');
      if (!tipo) return null;
      const enumDef = tipo.match(/^enum\((.*)\)$/i);
      if (enumDef) {
        // Los valores vienen entrecomillados: 'ACTIVO','ANULADO'
        const valores = enumDef[1]
          .split(',')
          .map((v) => v.trim().replace(/^'(.*)'$/, '$1').replace(/''/g, "'"))
          .filter(Boolean);
        return { valores, longitud: null };
      }
      const varchar = tipo.match(/^var?char\((\d+)\)$/i);
      return { valores: null, longitud: varchar ? Number(varchar[1]) : null };
    }).catch(() => null));
  }
  return estadoCache.get(tabla);
}

/**
 * Estados que la tabla puede guardar DE VERDAD, considerando también su bitácora:
 * los triggers copian el estado a `B<tabla>`, así que si esa columna es más
 * estrecha el INSERT falla igual aunque la tabla principal sí lo acepte.
 * Se devuelve la intersección de lo que aceptan ambas.
 */
async function estadosPermitidos(tabla) {
  const propio = await estadoDeTabla(tabla);
  if (!propio) return null;
  const bitacora = (await existeTabla(`B${tabla}`)) ? await estadoDeTabla(`B${tabla}`) : null;

  const valores = propio.valores && bitacora?.valores
    ? propio.valores.filter((v) => bitacora.valores.includes(v))
    : (propio.valores || bitacora?.valores || null);

  const longitudes = [propio.longitud, bitacora?.longitud].filter((n) => Number.isFinite(n));
  return {
    valores,
    longitud: longitudes.length ? Math.min(...longitudes) : null,
  };
}

module.exports = {
  existeColumna,
  existeTabla,
  sqlTransportistaDe,
  sqlActivo,
  estadoDeTabla,
  estadosPermitidos,
};
