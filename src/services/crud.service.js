/**
 * crud.service.js
 * Servicio CRUD genérico y seguro. Construye SQL a partir de la definición del
 * recurso (config/resources.js), usando solo columnas de la whitelist y
 * parámetros enlazados (placeholders) para prevenir inyección SQL.
 *
 * En cada INSERT/UPDATE se escribe `usuario_graba` con el usuario en sesión,
 * lo que permite que los triggers de bitácora registren al autor del cambio.
 */
const { query, queryOne, execute } = require('../database/db');
const { estadosPermitidos } = require('../utils/esquema');

/**
 * Variantes de género que significan lo MISMO. Permiten guardar en una columna
 * que solo admite una de las dos formas (ANULADA frente a ANULADO) sin cambiar
 * lo que el usuario eligió.
 */
const EQUIVALENTES = [
  ['ACTIVO', 'ACTIVA'],
  ['ANULADO', 'ANULADA'],
  ['PAGADO', 'PAGADA'],
  ['LIQUIDADO', 'LIQUIDADA'],
  ['ABIERTO', 'ABIERTA'],
  ['CERRADO', 'CERRADA'],
  ['INACTIVO', 'INACTIVA'],
];

/**
 * Ajusta el `estado` a lo que la columna acepta DE VERDAD.
 *
 * Las tablas de producción no son todas iguales: en unas `estado` es un ENUM con
 * una lista corta y en otras un VARCHAR. Al mandar un valor que la columna no
 * admite, MySQL responde «Data truncated for column 'estado'», un mensaje que no
 * le dice nada al usuario. Aquí se acepta la variante de género equivalente si la
 * columna la tiene, y si no, se explica en claro qué valores admite.
 */
async function normalizarEstado(def, fields) {
  if (fields.estado === undefined || fields.estado === null) return;
  const permitido = await estadosPermitidos(def.table);
  if (!permitido) return;

  const valor = String(fields.estado).trim().toUpperCase();

  if (Array.isArray(permitido.valores) && permitido.valores.length) {
    const admitidos = permitido.valores.map((v) => v.toUpperCase());
    if (admitidos.includes(valor)) { fields.estado = valor; return; }
    // Misma idea, otra forma: ANULADA donde la columna dice ANULADO.
    const pareja = EQUIVALENTES.find((par) => par.includes(valor));
    const alterno = pareja && pareja.find((v) => admitidos.includes(v));
    if (alterno) { fields.estado = alterno; return; }
    const e = new Error(
      `El estado "${valor}" no es válido para este registro. `
      + `Valores admitidos: ${permitido.valores.join(', ')}.`
    );
    e.status = 400;
    throw e;
  }

  if (permitido.longitud && valor.length > permitido.longitud) {
    const e = new Error(
      `El estado "${valor}" no cabe en este registro (máximo ${permitido.longitud} caracteres).`
    );
    e.status = 400;
    throw e;
  }
  fields.estado = valor;
}

/** Extrae del body solo las columnas permitidas del recurso. */
function pick(def, data) {
  const out = {};
  for (const col of def.columns) {
    if (data[col] !== undefined) {
      // normaliza cadenas vacías a NULL (útil para fechas y FKs opcionales)
      out[col] = data[col] === '' ? null : data[col];
    }
  }
  return out;
}

/** Lista todos los registros, ordenados por PK descendente. */
async function list(def) {
  return query(`SELECT * FROM \`${def.table}\` ORDER BY \`${def.pk}\` DESC`);
}

/** Obtiene un registro por su PK. */
async function getById(def, id) {
  return queryOne(`SELECT * FROM \`${def.table}\` WHERE \`${def.pk}\` = ?`, [id]);
}

/** Crea un registro. Devuelve el registro creado. */
async function create(def, data, usuario) {
  const fields = pick(def, data);
  await normalizarEstado(def, fields);
  const cols = Object.keys(fields);
  const vals = Object.values(fields);

  cols.push('usuario_graba');
  vals.push(usuario || 'sistema');

  const placeholders = cols.map(() => '?').join(', ');
  const colList = cols.map((c) => `\`${c}\``).join(', ');

  const result = await execute(
    `INSERT INTO \`${def.table}\` (${colList}) VALUES (${placeholders})`,
    vals
  );
  return getById(def, result.insertId);
}

/** Actualiza un registro por PK. Devuelve el registro actualizado. */
async function update(def, id, data, usuario) {
  const fields = pick(def, data);
  await normalizarEstado(def, fields);
  const cols = Object.keys(fields);
  const vals = Object.values(fields);

  // siempre actualiza usuario_graba para la auditoría
  const setParts = cols.map((c) => `\`${c}\` = ?`);
  setParts.push('`usuario_graba` = ?');
  vals.push(usuario || 'sistema');

  if (setParts.length === 1) {
    // solo usuario_graba: igual ejecuta para registrar auditoría
  }

  vals.push(id);
  await execute(
    `UPDATE \`${def.table}\` SET ${setParts.join(', ')} WHERE \`${def.pk}\` = ?`,
    vals
  );
  return getById(def, id);
}

/** Cambia solo el estado (activar/inactivar/anular). Requiere hasEstado. */
async function patchEstado(def, id, estado, usuario) {
  // Anular pasa por aquí, así que también hay que ajustar el valor a lo que
  // la columna admite.
  const campos = { estado };
  await normalizarEstado(def, campos);
  await execute(
    `UPDATE \`${def.table}\` SET \`estado\` = ?, \`usuario_graba\` = ? WHERE \`${def.pk}\` = ?`,
    [campos.estado, usuario || 'sistema', id]
  );
  return getById(def, id);
}

/** Elimina un registro por PK. */
async function remove(def, id) {
  // Para que el trigger AFTER UPDATE registre quién marcó usuario_graba antes
  // de borrar, no es necesario; el DELETE dispara el trigger AFTER DELETE.
  const result = await execute(`DELETE FROM \`${def.table}\` WHERE \`${def.pk}\` = ?`, [id]);
  return { affectedRows: result.affectedRows };
}

/** Estados que admite la columna del recurso (para armar el select). */
async function estadosDe(def) {
  const permitido = await estadosPermitidos(def.table);
  return {
    recurso: def.table,
    valores: permitido?.valores || null,
    longitud: permitido?.longitud || null,
  };
}

module.exports = { list, getById, create, update, patchEstado, remove, pick, estadosDe };
