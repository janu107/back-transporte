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
 *
 *   La FACTURA contra la que se cobra la elige el usuario en pantalla. Como el
 *   servicio externo no recibe ese dato, se deja anotado en
 *   control_captura_api.api_id_factura_sel y el SP lo respeta (ver
 *   sql/cambios_2026_08_factura_seleccionada.sql). Así no hay que modificar el
 *   servicio externo.
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
async function listarPendientes(idUbicacion) {
  // [2.1] Filtro opcional por predio/ubicación (se filtra en MySQL, no en React).
  const params = [];
  let filtro = '';
  if (idUbicacion !== undefined && idUbicacion !== null && idUbicacion !== '') {
    const idU = Number(idUbicacion);
    if (!Number.isNaN(idU)) { filtro = ' AND c.api_id_ubicacion = ?'; params.push(idU); }
  }
  return query(
    `SELECT c.api_id, c.api_numero, c.api_num_vale, c.api_fecha, c.api_cant_galones,
            c.api_id_piloto, c.api_licencia, c.api_nombre_piloto, c.api_id_vehiculo,
            c.api_placa, c.api_descripcion, c.api_manguera, c.api_surtidor, c.api_estado,
            c.api_id_ubicacion, u.descripcion AS api_ubicacion_nombre
       FROM control_captura_api c
       LEFT JOIN cat_ubicacion_bomba u ON u.codigo = c.api_id_ubicacion
      WHERE c.api_estado = 'P'${filtro}
      ORDER BY c.api_fecha DESC, c.api_id DESC`,
    params
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

/** Igual que requerirNumero pero admite que no venga: devuelve null. */
function opcionalNumero(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  return Number.isNaN(n) ? null : n;
}

/** Borra la factura anotada en un despacho (no hay selección para este intento). */
async function limpiarFacturaElegida(apiId) {
  try {
    await execute('UPDATE control_captura_api SET api_id_factura_sel = NULL WHERE api_id = ?', [apiId]);
  } catch (e) {
    // Si el cambio de base todavía no está aplicado, no hay nada que limpiar.
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }
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
 * Deja anotada en el despacho la factura que el usuario eligió, para que el SP
 * cobre contra ESA y no contra la que él escogería por su cuenta.
 *
 * Se valida aquí y no solo en el SP para poder dar un mensaje entendible antes
 * de mandar nada al servicio externo.
 */
async function anotarFacturaElegida({ api_id: apiId, id_factura_vale: idFactura,
  id_producto: idProducto, id_bomba: idBomba }) {
  const [factura] = await query(
    `SELECT codigo, factura, saldo, estado
       FROM man_facturas_vales
      WHERE codigo = ? AND id_producto = ? AND id_bomba = ?`,
    [idFactura, idProducto, idBomba]
  );
  if (!factura) {
    const e = new Error('La factura seleccionada no corresponde al producto y a la bomba del despacho.');
    e.status = 400;
    throw e;
  }
  if (String(factura.estado).toUpperCase() !== 'ACTIVO') {
    const e = new Error(`La factura ${factura.factura} no está activa (estado: ${factura.estado}).`);
    e.status = 409;
    throw e;
  }

  // Si la columna todavía no existe (cambio de base sin aplicar), el despacho
  // igual se confirma: solo que el SP elegirá la factura como antes, y de eso
  // avisa `aviso_factura` al terminar.
  try {
    await execute(
      'UPDATE control_captura_api SET api_id_factura_sel = ? WHERE api_id = ?',
      [idFactura, apiId]
    );
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }
}

/** Facturas contra las que quedó cobrado un despacho ya confirmado. */
async function facturasCobradas(apiId) {
  const filas = await query(
    `SELECT d.id_factura_vale AS codigo, f.factura, d.cantidad, d.total
       FROM pro_detalle_facturas d
       LEFT JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
      WHERE d.id_api_origen = ?
      ORDER BY d.correlativo`,
    [apiId]
  ).catch(() => []);
  return {
    facturas: filas,
    // Con cruce de facturas son dos: basta que la elegida sea una de ellas.
    coincide: (idFactura) => filas.length > 0
      && filas.some((f) => Number(f.codigo) === Number(idFactura)),
  };
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

  // La factura elegida es OPCIONAL a propósito: si se exigiera, una pantalla que
  // todavía no la mande (un build anterior al despliegue) dejaría de confirmar.
  // Cuando viene, se anota ANTES de confirmar porque el SP la lee de ahí, y se
  // manda también en el cuerpo por si el servicio externo llega a usarla.
  const idFactura = opcionalNumero(data.id_factura_vale);
  if (idFactura !== null) {
    payload.id_factura_vale = idFactura;
    await anotarFacturaElegida({ ...payload, id_factura_vale: idFactura });
  } else {
    // Sin selección se limpia la anotación previa, para que un reintento no
    // arrastre la factura de un intento anterior.
    await limpiarFacturaElegida(payload.api_id);
  }

  try {
    const resp = await axios.post(CONFIRM_EXTERNAL_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    });
    // El externo hace SP + saldo + marca 'C' + PDF + correo. Se comprueba contra
    // qué factura quedó cobrado y se avisa si no fue la elegida, en vez de que
    // el vale salga impreso con otro número sin que nadie se entere.
    const cobro = await facturasCobradas(payload.api_id);
    // Solo se puede hablar de coincidencia si hubo una factura elegida.
    const coincide = idFactura === null ? null : cobro.coincide(idFactura);
    return {
      ...resp.data,
      facturas_cobradas: cobro.facturas,
      factura_coincide: coincide,
      aviso_factura: coincide === false
        ? `El vale quedó cobrado a ${cobro.facturas.map((f) => f.factura).join(' y ') || 'otra factura'}, `
          + 'no a la seleccionada. Verifique que el cambio de base de datos '
          + '(cambios_2026_08_factura_seleccionada.sql) esté aplicado.'
        : null,
    };
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
