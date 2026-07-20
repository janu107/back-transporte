/**
 * controlApi.service.js
 * Lógica del módulo CONTROL DEL API (Confirmación de Vales - Enlace MATO).
 *
 * - listarPendientes(): vales capturados desde el API en estado 'P' (Pendiente).
 * - confirmar(): [M1] DELEGA la confirmación al servicio externo
 *   (CONFIRM_EXTERNAL_URL, por defecto http://localhost:3001/api/confirmar-despacho).
 *   Ese servicio ejecuta sp_confirmar_despacho_api, actualiza saldo, marca el vale
 *   como 'C', genera el PDF y envía el correo (Brevo). Nuestro backend YA NO ejecuta
 *   el SP directamente para evitar doble confirmación.
 */
const axios = require('axios');
const { query, execute } = require('../database/db');

// URL del servicio externo de confirmación + correo (configurable por entorno).
const CONFIRM_EXTERNAL_URL = process.env.CONFIRM_EXTERNAL_URL || 'http://localhost:3001/api/confirmar-despacho';

/**
 * listarPendientes
 * Devuelve los vales en estado 'P' que alimenta combustible-api (DieselPlus).
 * Las columnas son las reales de la tabla control_captura_api (api_*).
 */
async function listarPendientes() {
  return query(
    `SELECT c.api_id, c.api_numero, c.api_num_vale, c.api_fecha, c.api_cant_galones,
            c.api_id_piloto, c.api_licencia, c.api_nombre_piloto, c.api_id_vehiculo,
            c.api_placa, c.api_descripcion, c.api_manguera, c.api_surtidor, c.api_estado,
            c.api_id_ubicacion, u.descripcion AS api_ubicacion_nombre
       FROM control_captura_api c
       LEFT JOIN cat_ubicacion_bomba u ON u.codigo = c.api_id_ubicacion
      WHERE c.api_estado = 'P'
      ORDER BY c.api_fecha DESC, c.api_id DESC`
  );
}

/**
 * asignarUbicacion
 * Asigna (o limpia) el predio/ubicación de un vale del API.
 * @param {number} apiId        control_captura_api.api_id
 * @param {number|null} idUbic  cat_ubicacion_bomba.codigo (null para limpiar)
 * @returns {Promise<{api_id:number, api_id_ubicacion:number|null, api_ubicacion_nombre:string|null}>}
 */
async function asignarUbicacion(apiId, idUbic) {
  const id = requerirNumero(apiId, 'api_id');

  // idUbic puede ser null (limpiar) o un entero positivo válido.
  let idUbicacion = null;
  if (idUbic !== undefined && idUbic !== null && idUbic !== '') {
    idUbicacion = requerirNumero(idUbic, 'id_ubicacion');
    const existe = await query('SELECT codigo FROM cat_ubicacion_bomba WHERE codigo = ?', [idUbicacion]);
    if (!existe.length) {
      const e = new Error('El predio (ubicación) seleccionado no existe.');
      e.status = 400;
      throw e;
    }
  }

  const result = await execute(
    'UPDATE control_captura_api SET api_id_ubicacion = ? WHERE api_id = ? AND api_estado = ?',
    [idUbicacion, id, 'P']
  );
  if (!result.affectedRows) {
    const e = new Error('Vale no encontrado o ya no está pendiente.');
    e.status = 404;
    throw e;
  }

  const [row] = await query(
    `SELECT c.api_id, c.api_id_ubicacion, u.descripcion AS api_ubicacion_nombre
       FROM control_captura_api c
       LEFT JOIN cat_ubicacion_bomba u ON u.codigo = c.api_id_ubicacion
      WHERE c.api_id = ?`,
    [id]
  );
  return row;
}

/** Valida que un valor sea un entero/numero positivo; lanza Error 400 si no. */
function requerirNumero(valor, campo) {
  const n = Number(valor);
  if (valor === undefined || valor === null || valor === '' || Number.isNaN(n)) {
    const e = new Error(`El campo "${campo}" es obligatorio y debe ser numérico.`);
    e.status = 400;
    throw e;
  }
  return n;
}

/**
 * confirmar
 * Ejecuta sp_confirmar_despacho_api (el SP oficial del servidor) con los datos
 * seleccionados en pantalla. Firma real del SP (8 IN + 4 OUT):
 *   (p_api_id, p_id_piloto, p_id_camion, p_id_transportista, p_id_producto,
 *    p_id_bomba, p_id_poliza, p_usuario, OUT det1, det2, hubo_cruce, mensaje)
 * @param {object} data { api_id, id_piloto, id_camion, id_transportista, id_producto, id_bomba, id_poliza }
 * @param {string} usuario  usuario en sesión
 * @returns {Promise<object>} respuesta del servicio externo (ok, mensaje, correo_enviado, ...)
 */
async function confirmar(data, usuario) {
  // Presencia mínima de parámetros antes de delegar.
  const payload = {
    api_id: requerirNumero(data.api_id, 'api_id'),
    id_transportista: requerirNumero(data.id_transportista, 'id_transportista'),
    id_piloto: requerirNumero(data.id_piloto, 'id_piloto'),
    id_camion: requerirNumero(data.id_camion, 'id_camion'),
    id_producto: requerirNumero(data.id_producto, 'id_producto'),
    id_bomba: requerirNumero(data.id_bomba, 'id_bomba'),
    id_poliza: requerirNumero(data.id_poliza, 'id_poliza'),
    usuario: usuario || 'sistema',
  };

  try {
    const resp = await axios.post(CONFIRM_EXTERNAL_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    });
    // El externo hace SP + saldo + marca 'C' + PDF + correo. Devolvemos su respuesta.
    return resp.data;
  } catch (e) {
    const msg =
      e.response?.data?.mensaje ||
      e.response?.data?.message ||
      (e.code === 'ECONNREFUSED' || e.code === 'ECONNABORTED'
        ? `No se pudo contactar el servicio de confirmación (${CONFIRM_EXTERNAL_URL}).`
        : e.message) ||
      'No se pudo confirmar el despacho.';
    const err = new Error(msg);
    err.status = e.response?.status || 502;
    throw err;
  }
}

module.exports = { listarPendientes, asignarUbicacion, confirmar };
