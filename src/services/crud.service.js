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
  await execute(
    `UPDATE \`${def.table}\` SET \`estado\` = ?, \`usuario_graba\` = ? WHERE \`${def.pk}\` = ?`,
    [estado, usuario || 'sistema', id]
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

module.exports = { list, getById, create, update, patchEstado, remove, pick };
