/**
 * detalleFactura.service.js — DETALLE DE FACTURA (P14) sobre pro_detalle_facturas.
 *
 * Alta manual de un vale de combustible contra una factura ACTIVA:
 *   - Valida factura ACTIVA con saldo, póliza ABIERTA, piloto del transportista.
 *   - cantidad > 0 y cantidad <= saldo de la factura.
 *   - total = cantidad × precio (calculado en servidor).
 *   - num_vale correlativo AÑO+00000.
 *   - Transaccional: bloquea la factura (FOR UPDATE), inserta el detalle y
 *     descuenta el saldo. Rollback ante cualquier error.
 *   - Anular: restaura el saldo y marca estado='ANULADO' (no borra físico).
 */
const { query, queryOne, execute, withTransaction } = require('../database/db');
const { siguienteCorrelativo } = require('../utils/correlativo');

const nz = (v) => (v === '' || v === undefined ? null : v);
function requerirNumero(v, campo) {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || Number.isNaN(n)) {
    const e = new Error(`El campo "${campo}" es obligatorio y debe ser numérico.`); e.status = 400; throw e;
  }
  return n;
}
function errorNegocio(mensaje, status = 409) { const e = new Error(mensaje); e.status = status; return e; }
const money = (v) => Number(Number(v || 0).toFixed(2));

async function listar() {
  return query('SELECT * FROM `pro_detalle_facturas` ORDER BY `correlativo` DESC');
}

/** Valida reglas y devuelve el registro normalizado + la factura (para saldo/precio). */
async function validar(data, runner = query) {
  const idFactura = requerirNumero(data.id_factura_vale, 'id_factura_vale');
  const factura = await (runner === query
    ? queryOne('SELECT codigo, precio, saldo, estado FROM man_facturas_vales WHERE codigo = ?', [idFactura])
    : runner('SELECT codigo, precio, saldo, estado FROM man_facturas_vales WHERE codigo = ? FOR UPDATE', [idFactura]).then((r) => r[0]));
  if (!factura) throw errorNegocio('La factura no existe.', 400);
  if (String(factura.estado).toUpperCase() !== 'ACTIVO') {
    throw errorNegocio(`La factura no está ACTIVA (estado: ${factura.estado}).`);
  }

  const idPoliza = requerirNumero(data.id_poliza, 'id_poliza');
  const poliza = await queryOne('SELECT codigo, estado FROM man_poliza WHERE codigo = ?', [idPoliza]);
  if (!poliza) throw errorNegocio('La póliza no existe.', 400);
  if (String(poliza.estado).toUpperCase() !== 'ABIERTA') {
    throw errorNegocio(`La póliza no está ABIERTA (estado: ${poliza.estado}).`);
  }

  const idCamion = requerirNumero(data.id_camion, 'id_camion');
  const camion = await queryOne('SELECT codigo, id_transportista FROM man_camion WHERE codigo = ?', [idCamion]);
  if (!camion) throw errorNegocio('El camión (placa) no existe.', 400);
  const idTransportista = camion.id_transportista;
  if (idTransportista == null) throw errorNegocio('La placa no tiene transportista asociado.');

  const idPiloto = requerirNumero(data.id_piloto, 'id_piloto');
  const piloto = await queryOne('SELECT id_transportista FROM man_pilotos WHERE codigo = ?', [idPiloto]);
  if (!piloto) throw errorNegocio('El piloto no existe.', 400);
  if (Number(piloto.id_transportista) !== Number(idTransportista)) {
    throw errorNegocio('El piloto no pertenece al transportista de la placa.');
  }

  const cantidad = money(data.cantidad);
  if (cantidad <= 0) throw errorNegocio('La cantidad debe ser mayor que cero.', 400);
  if (cantidad > Number(factura.saldo)) {
    throw errorNegocio(`La cantidad (${cantidad}) supera el saldo de la factura (${money(factura.saldo)}).`);
  }
  const total = money(cantidad * Number(factura.precio || 0));

  return {
    row: {
      id_factura_vale: idFactura, id_poliza: idPoliza, id_transportista: idTransportista,
      id_camion: idCamion, id_piloto: idPiloto, fecha: nz(data.fecha), cantidad, total,
      origen: 'M', estado: 'ACTIVO',
    },
    factura,
  };
}

/** Crea el detalle: genera correlativo, inserta y descuenta el saldo (transaccional). */
async function crear(data, usuario) {
  const anio = new Date().getFullYear();
  return withTransaction(async (conn) => {
    const runner = (sql, params = []) => conn.query(sql, params).then(([rows]) => rows);
    const { row } = await validar(data, runner); // bloquea la factura con FOR UPDATE

    const numVale = await siguienteCorrelativo(conn, 'pro_detalle_facturas', 'num_vale', anio);
    const cols = ['num_vale', 'id_factura_vale', 'id_poliza', 'id_transportista', 'id_camion',
      'id_piloto', 'fecha', 'cantidad', 'total', 'origen', 'estado', 'usuario_graba'];
    const vals = [numVale, row.id_factura_vale, row.id_poliza, row.id_transportista, row.id_camion,
      row.id_piloto, row.fecha, row.cantidad, row.total, row.origen, row.estado, usuario || 'sistema'];
    const [res] = await conn.query(
      `INSERT INTO pro_detalle_facturas (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      vals
    );
    // Descuenta el saldo de la factura.
    await conn.query('UPDATE man_facturas_vales SET saldo = saldo - ? WHERE codigo = ?', [row.cantidad, row.id_factura_vale]);

    const [rows] = await conn.query('SELECT * FROM pro_detalle_facturas WHERE correlativo = ?', [res.insertId]);
    return rows[0];
  });
}

/** Anula un vale manual: restaura el saldo de la factura y marca ANULADO. */
async function cambiarEstado(id, estado, usuario) {
  const correlativo = requerirNumero(id, 'correlativo');
  const est = String(estado || '').toUpperCase() === 'ACTIVO' ? 'ACTIVO' : 'ANULADO';
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM pro_detalle_facturas WHERE correlativo = ? FOR UPDATE', [correlativo]);
    const det = rows[0];
    if (!det) throw errorNegocio('Vale no encontrado.', 404);
    if (String(det.estado).toUpperCase() === est) {
      return det; // sin cambios
    }
    // Sólo se permite anular vales manuales (origen 'M'); los del API no se tocan aquí.
    if (String(det.origen).toUpperCase() !== 'M') {
      throw errorNegocio('Solo se pueden anular vales manuales desde esta pantalla.', 400);
    }
    if (est === 'ANULADO') {
      // Restaura saldo.
      await conn.query('UPDATE man_facturas_vales SET saldo = saldo + ? WHERE codigo = ?', [det.cantidad, det.id_factura_vale]);
    } else {
      // Reactivar: vuelve a descontar (valida saldo).
      const [f] = await conn.query('SELECT saldo FROM man_facturas_vales WHERE codigo = ? FOR UPDATE', [det.id_factura_vale]);
      if (!f[0] || Number(f[0].saldo) < Number(det.cantidad)) throw errorNegocio('Saldo insuficiente para reactivar el vale.');
      await conn.query('UPDATE man_facturas_vales SET saldo = saldo - ? WHERE codigo = ?', [det.cantidad, det.id_factura_vale]);
    }
    await conn.query('UPDATE pro_detalle_facturas SET estado = ?, usuario_graba = ? WHERE correlativo = ?', [est, usuario || 'sistema', correlativo]);
    const [upd] = await conn.query('SELECT * FROM pro_detalle_facturas WHERE correlativo = ?', [correlativo]);
    return upd[0];
  });
}

module.exports = { listar, crear, cambiarEstado };
