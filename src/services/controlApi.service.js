/**
 * controlApi.service.js
 * Lógica del módulo CONTROL DEL API (Confirmación de Vales - Enlace MATO).
 *
 * - listarPendientes(): vales capturados desde el API en estado 'P' (Pendiente).
 * - confirmar(): ejecuta el procedimiento sp_confirmar_despacho_api (botón CONFIRMAR),
 *   que genera el/los registro(s) en pro_detalle_facturas y marca el vale como 'C'.
 *
 * El SP usa parámetros OUT; se invoca sobre una conexión dedicada del pool
 * (CALL ... @vars; SELECT @vars) porque el pool no tiene multipleStatements.
 */
const { query } = require('../database/db');
const { getPool } = require('../database/pool');

/**
 * listarPendientes
 * Devuelve los vales en estado 'P' que alimenta combustible-api (DieselPlus).
 * Las columnas son las reales de la tabla control_captura_api (api_*).
 */
async function listarPendientes() {
  return query(
    `SELECT api_id, api_numero, api_num_vale, api_fecha, api_cant_galones,
            api_id_piloto, api_licencia, api_nombre_piloto, api_id_vehiculo,
            api_placa, api_descripcion, api_manguera, api_surtidor, api_estado
       FROM control_captura_api
      WHERE api_estado = 'P'
      ORDER BY api_fecha DESC, api_id DESC`
  );
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
 * @returns {Promise<{det1:number|null, det2:number|null, hubo_cruce:number, mensaje:string}>}
 */
async function confirmar(data, usuario) {
  const apiId = requerirNumero(data.api_id, 'api_id');
  const idPiloto = requerirNumero(data.id_piloto, 'id_piloto');
  const idCamion = requerirNumero(data.id_camion, 'id_camion');
  const idTransportista = requerirNumero(data.id_transportista, 'id_transportista');
  const idProducto = requerirNumero(data.id_producto, 'id_producto');
  const idBomba = requerirNumero(data.id_bomba, 'id_bomba');
  const idPoliza = requerirNumero(data.id_poliza, 'id_poliza');

  const conn = await getPool().getConnection();
  try {
    await conn.query(
      'CALL sp_confirmar_despacho_api(?,?,?,?,?,?,?,?, @d1, @d2, @cruce, @msg)',
      [apiId, idPiloto, idCamion, idTransportista, idProducto, idBomba, idPoliza, usuario || 'sistema']
    );
    const [rows] = await conn.query(
      'SELECT @d1 AS det1, @d2 AS det2, @cruce AS hubo_cruce, @msg AS mensaje'
    );
    const out = rows[0] || {};
    return {
      det1: out.det1 != null ? Number(out.det1) : null,
      det2: out.det2 != null ? Number(out.det2) : null,
      hubo_cruce: Number(out.hubo_cruce) === 1 ? 1 : 0,
      mensaje: out.mensaje || 'Despacho confirmado.',
    };
  } catch (e) {
    // El SP lanza SIGNAL SQLSTATE '45000' en errores de negocio
    // (ya confirmado, sin factura disponible, saldo insuficiente, etc.).
    const err = new Error(e.sqlMessage || e.message || 'No se pudo confirmar el despacho.');
    err.status = 409;
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { listarPendientes, confirmar };
