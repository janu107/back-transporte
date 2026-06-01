/**
 * response.js
 * Helpers para estandarizar las respuestas JSON de la API.
 */

/**
 * success
 * @param {object} res Express response
 * @param {*} data Datos a devolver
 * @param {string} message Mensaje descriptivo
 * @param {number} status Código HTTP (default 200)
 */
function success(res, data = null, message = 'OK', status = 200) {
  return res.status(status).json({ ok: true, message, data });
}

/**
 * error
 * @param {object} res Express response
 * @param {string} message Mensaje de error
 * @param {number} status Código HTTP (default 500)
 * @param {*} details Detalle opcional del error
 */
function error(res, message = 'Error interno', status = 500, details = null) {
  return res.status(status).json({ ok: false, message, details });
}

module.exports = { success, error };
