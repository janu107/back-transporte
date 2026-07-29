/**
 * historial.service.js — [v6 §3] HISTORIAL (tablas his_*).
 *
 * Consulta las 3 tablas históricas del sistema:
 *   - det-poliza        -> his_det_poliza      (Detalle de Póliza)
 *   - val-detalle       -> his_val_detalle     (Detalle de Vales)
 *   - anticipo-efectivo -> his_anticipo_efectivo (Detalle de Anticipos)
 *
 * Es ADAPTABLE al esquema: como estas tablas viven en producción y su estructura
 * puede variar, el servicio lee las columnas reales de information_schema y arma
 * los filtros sobre las columnas que existan (rango de fechas sobre la primera
 * columna de fecha; búsqueda de texto sobre las columnas VARCHAR/TEXT). Así no se
 * "inventan" nombres de columnas ni se rompe si la tabla cambia.
 *
 * Seguridad: el tipo se valida contra una lista blanca (solo esas 3 tablas) y los
 * VALORES de los filtros van parametrizados. Los nombres de columna provienen de
 * information_schema (identificadores reales de la BD), no de entrada del usuario.
 */
const { query } = require('../database/db');

const TABLAS = {
  'det-poliza': 'his_det_poliza',
  'val-detalle': 'his_val_detalle',
  'anticipo-efectivo': 'his_anticipo_efectivo',
};

const TIPOS_TEXTO = ['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext'];
const TIPOS_FECHA = ['date', 'datetime', 'timestamp'];

function bad(mensaje, status = 400) { const e = new Error(mensaje); e.status = status; return e; }

async function columnasDe(tabla) {
  return query(
    `SELECT COLUMN_NAME AS name, DATA_TYPE AS type
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [tabla]
  );
}

async function consultar(tipo, f = {}) {
  const tabla = TABLAS[tipo];
  if (!tabla) throw bad('Tipo de historial no válido.', 400);

  const cols = await columnasDe(tabla);
  if (!cols.length) throw bad(`La tabla de historial "${tabla}" no existe en la base de datos.`, 404);

  const nombres = cols.map((c) => c.name);
  const textCols = cols.filter((c) => TIPOS_TEXTO.includes(String(c.type).toLowerCase())).map((c) => c.name);
  // Columna de fecha: la primera cuyo nombre contenga "fecha", o la primera de tipo fecha.
  const dateCol = (cols.find((c) => /fecha/i.test(c.name))
    || cols.find((c) => TIPOS_FECHA.includes(String(c.type).toLowerCase())) || {}).name || null;

  const where = [];
  const params = [];
  if (dateCol && f.fecha_inicio) { where.push(`\`${dateCol}\` >= ?`); params.push(f.fecha_inicio); }
  if (dateCol && f.fecha_fin) { where.push(`\`${dateCol}\` <= ?`); params.push(f.fecha_fin); }
  if (f.q && textCols.length) {
    where.push(`(${textCols.map((c) => `\`${c}\` LIKE ?`).join(' OR ')})`);
    textCols.forEach(() => params.push(`%${f.q}%`));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // limit/offset como enteros validados (no como placeholders, por compatibilidad).
  const page = Math.max(1, Number(f.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(f.limit) || 100));
  const offset = (page - 1) * limit;
  const orderCol = dateCol || nombres[0];

  const totalRows = await query(`SELECT COUNT(*) AS n FROM \`${tabla}\` ${whereSql}`, params);
  const total = Number(totalRows[0]?.n || 0);
  const rows = await query(
    `SELECT * FROM \`${tabla}\` ${whereSql} ORDER BY \`${orderCol}\` DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return { tabla, columnas: nombres, date_column: dateCol, total, page, limit, rows };
}

module.exports = { consultar, TABLAS };
