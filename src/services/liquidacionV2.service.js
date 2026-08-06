/**
 * liquidacionV2.service.js — módulo de liquidaciones v2.
 *
 * La escritura se delega a los procedimientos almacenados definidos por el
 * módulo. Las consultas de vista previa, historial, sobregiros y reporte se
 * mantienen aquí para que todas las pantallas usen las mismas reglas.
 */
const { query, queryOne } = require('../database/db');

function errorNegocio(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function idValido(value, field = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw errorNegocio(`${field} inválido.`, 400);
  return id;
}

const money = (value) => Number(Number(value || 0).toFixed(2));

let modeloOficialPromise;
function usaModeloOficial() {
  if (!modeloOficialPromise) {
    modeloOficialPromise = queryOne(
      `SELECT COUNT(*) AS total
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'pro_liquidacion_detalle'
          AND COLUMN_NAME = 'valor_vales'`
    ).then((row) => Number(row?.total || 0) > 0);
  }
  return modeloOficialPromise;
}

function validarRango(fechaInicio, fechaFin) {
  if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
    throw errorNegocio('La fecha de inicio no puede ser posterior a la fecha final.', 400);
  }
}

async function polizasDisponibles() {
  const oficial = await usaModeloOficial();
  const estadosPoliza = oficial ? "('ABIERTA')" : "('CERRADA', 'CERRADA SIN LIQUIDAR')";
  const estadosActivos = oficial ? "('PENDIENTE', 'PAGADA')" : "('LIQUIDADO')";
  return query(
    `SELECT p.codigo, p.nombre_poliza, p.fecha, p.estado,
            (SELECT lr.correlativo
               FROM pro_liquidaciones lr
              WHERE lr.id_poliza = p.codigo AND lr.id_transportista IS NULL
                AND COALESCE(lr.revertida, 0) = 1
              ORDER BY lr.correlativo DESC LIMIT 1) AS id_liq_origen
       FROM man_poliza p
      WHERE UPPER(p.estado) IN ${estadosPoliza}
        AND NOT EXISTS (
          SELECT 1
            FROM pro_liquidaciones l
           WHERE l.id_poliza = p.codigo
             AND l.id_transportista IS NULL
             AND COALESCE(l.revertida, 0) = 0
             AND UPPER(l.estado) IN ${estadosActivos}
        )
      ORDER BY p.fecha DESC, p.nombre_poliza`
  );
}

async function validarPolizaParaGenerar(idPoliza) {
  const oficial = await usaModeloOficial();
  const poliza = await queryOne(
    `SELECT codigo, nombre_poliza, fecha, estado
       FROM man_poliza
      WHERE codigo = ?`,
    [idPoliza]
  );
  if (!poliza) throw errorNegocio('La póliza no existe.', 404);
  const estadosPermitidos = oficial ? ['ABIERTA'] : ['CERRADA', 'CERRADA SIN LIQUIDAR'];
  if (!estadosPermitidos.includes(String(poliza.estado || '').toUpperCase())) {
    throw errorNegocio(`La póliza debe estar ${estadosPermitidos.join(' o ')} para liquidarse (estado actual: ${poliza.estado}).`);
  }
  const activa = await queryOne(
    `SELECT correlativo
       FROM pro_liquidaciones
      WHERE id_poliza = ? AND id_transportista IS NULL AND COALESCE(revertida, 0) = 0
        AND UPPER(estado) IN (${oficial ? "'PENDIENTE', 'PAGADA'" : "'LIQUIDADO'"})
      LIMIT 1`,
    [idPoliza]
  );
  if (activa) throw errorNegocio('La póliza ya tiene una liquidación activa.');
  return poliza;
}

async function vistaPrevia(idPoliza) {
  const id = idValido(idPoliza, 'id_poliza');
  const poliza = await validarPolizaParaGenerar(id);
  const oficial = await usaModeloOficial();

  const consultas = oficial ? [
    query(
      `SELECT c.id_transportista, COUNT(*) AS cantidad_viajes,
              COALESCE(SUM(d.valor), 0) AS valor_viajes
         FROM pro_poliza_detalle d
         JOIN man_camion c ON c.codigo = d.id_camion
        WHERE d.id_poliza = ? AND UPPER(d.estado) NOT IN ('ANULADO', 'ANULADA')
        GROUP BY c.id_transportista`,
      [id]
    ),
    query(
      `SELECT id_transportista, COUNT(*) AS cantidad_anticipos,
              COALESCE(SUM(valor), 0) AS valor_anticipos
         FROM pro_anticipo_provision
        WHERE id_poliza = ? AND UPPER(estado) NOT IN ('ANULADO', 'ANULADA')
        GROUP BY id_transportista`,
      [id]
    ),
    query(
      `SELECT d.correlativo, d.num_vale, c.id_transportista, d.fecha,
              d.cantidad AS galones, f.factura, f.precio,
              COALESCE(d.total, d.cantidad * f.precio, 0) AS total
         FROM pro_detalle_facturas d
         JOIN man_camion c ON c.codigo = d.id_camion
         LEFT JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
        WHERE d.id_poliza = ?
        ORDER BY c.id_transportista, d.fecha, d.correlativo`,
      [id]
    ),
    query(
      `SELECT id_transportista, COALESCE(SUM(saldo_pendiente), 0) AS saldo
         FROM pro_sobregiro_transportista
        WHERE UPPER(estado) = 'PENDIENTE'
        GROUP BY id_transportista`
    ),
    queryOne(
      `SELECT COALESCE(CAST(valor AS DECIMAL(14,4)), 0) AS valor_suministro
         FROM con_parametros
        WHERE clave = 'valor_galon_combustible'
        LIMIT 1`
    ),
  ] : [
    query(
      `SELECT COALESCE(d.id_transportista, c.id_transportista) AS id_transportista,
              COUNT(*) AS cantidad_viajes, COALESCE(SUM(d.valor), 0) AS valor_viajes
         FROM pro_poliza_detalle d
         LEFT JOIN man_camion c ON c.codigo = d.id_camion
        WHERE d.id_poliza = ? AND UPPER(d.estado) <> 'ANULADO'
        GROUP BY COALESCE(d.id_transportista, c.id_transportista)`,
      [id]
    ),
    query(
      `SELECT id_transportista, COUNT(*) AS cantidad_anticipos,
              COALESCE(SUM(valor), 0) AS valor_anticipos
         FROM pro_anticipo_provision
        WHERE id_poliza = ? AND UPPER(estado) IN ('ACTIVO', 'PENDIENTE')
        GROUP BY id_transportista`,
      [id]
    ),
    query(
      `SELECT d.correlativo, d.num_vale, d.id_transportista, d.fecha, d.cantidad AS galones,
              f.factura, f.precio,
              COALESCE(d.total, d.cantidad * f.precio, 0) AS total
         FROM pro_detalle_facturas d
         LEFT JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
        WHERE d.id_poliza = ? AND UPPER(d.estado) IN ('ACTIVO', 'PENDIENTE')
        ORDER BY d.id_transportista, d.fecha, d.correlativo`,
      [id]
    ),
    query(
      `SELECT id_transportista,
              COALESCE(SUM(valor_sobregiro - valor_abonado), 0) AS saldo
         FROM pro_sobregiro_transportista
        WHERE UPPER(estado) = 'PENDIENTE'
        GROUP BY id_transportista`
    ),
    queryOne(
      `SELECT COALESCE(valor_galon_combustible, 0) AS valor_suministro
         FROM con_parametros
        WHERE codigo = 1`
    ),
  ];
  const [viajes, anticipos, vales, sobregiros, parametro] = await Promise.all(consultas);

  const porId = new Map();
  const asegurar = (value) => {
    const idTransportista = Number(value);
    if (!idTransportista) return null;
    if (!porId.has(idTransportista)) {
      porId.set(idTransportista, {
        id_transportista: idTransportista,
        cantidad_viajes: 0,
        valor_viajes: 0,
        cantidad_anticipos: 0,
        valor_anticipos: 0,
        valor_diesel: 0,
        total_galones: 0,
        sobregiro_anterior: 0,
        vales: [],
      });
    }
    return porId.get(idTransportista);
  };

  viajes.forEach((row) => Object.assign(asegurar(row.id_transportista) || {}, {
    cantidad_viajes: Number(row.cantidad_viajes || 0),
    valor_viajes: money(row.valor_viajes),
  }));
  anticipos.forEach((row) => Object.assign(asegurar(row.id_transportista) || {}, {
    cantidad_anticipos: Number(row.cantidad_anticipos || 0),
    valor_anticipos: money(row.valor_anticipos),
  }));
  vales.forEach((row) => {
    const item = asegurar(row.id_transportista);
    if (!item) return;
    item.valor_diesel = money(item.valor_diesel + Number(row.total || 0));
    item.total_galones = money(item.total_galones + Number(row.galones || 0));
    item.vales.push({
      correlativo: row.correlativo,
      num_vale: row.num_vale,
      factura: row.factura,
      fecha: row.fecha,
      galones: money(row.galones),
      precio: money(row.precio),
      total: money(row.total),
    });
  });
  sobregiros.forEach((row) => {
    const item = porId.get(Number(row.id_transportista));
    if (item) item.sobregiro_anterior = money(row.saldo);
  });

  const ids = [...porId.keys()];
  if (!ids.length) return { poliza, valor_suministro: money(parametro?.valor_suministro), transportistas: [] };
  const transportistas = await query(
    `SELECT codigo, nit, nombre_comercial, COALESCE(impuesto, 0) AS porcentaje_impuesto
       FROM man_transportista
      WHERE codigo IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const catalogo = new Map(transportistas.map((row) => [Number(row.codigo), row]));
  const valorSuministro = Number(parametro?.valor_suministro || 0);

  const resultado = ids.map((idTransportista) => {
    const item = porId.get(idTransportista);
    const transportista = catalogo.get(idTransportista) || {};
    const baseGravable = money(Math.max(0, item.valor_viajes - item.valor_diesel));
    const porcentajeImpuesto = Number(transportista.porcentaje_impuesto || 0);
    const valorImpuesto = money(baseGravable * porcentajeImpuesto / 100);
    const totalFacturar = money(baseGravable + (oficial ? valorImpuesto : -valorImpuesto));
    const suministro = money(item.total_galones * valorSuministro);
    const valorLiquidacion = money(
      totalFacturar - item.valor_anticipos - suministro - item.sobregiro_anterior
    );
    return {
      ...item,
      nit: transportista.nit || '',
      nombre: transportista.nombre_comercial || '',
      base_gravable: baseGravable,
      porcentaje_impuesto: porcentajeImpuesto,
      valor_impuesto: valorImpuesto,
      total_facturar: totalFacturar,
      suministro,
      valor_liquidacion: valorLiquidacion,
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return { poliza, valor_suministro: money(valorSuministro), transportistas: resultado };
}

async function detalleLiquidacion(idLiquidacion) {
  const id = idValido(idLiquidacion, 'id_liquidacion');
  const oficial = await usaModeloOficial();
  const liquidacion = await queryOne(
    `SELECT l.correlativo, l.num_liquidacion, l.id_poliza, l.estado, l.fecha_liquidacion,
            l.usuario_graba, l.revertida, l.motivo_reversion, l.usuario_reversion,
            l.fecha_reversion, l.id_liq_origen, p.nombre_poliza,
            origen.num_liquidacion AS num_liquidacion_origen,
            reemplazo.num_liquidacion AS num_liquidacion_reemplazo
       FROM pro_liquidaciones l
       JOIN man_poliza p ON p.codigo = l.id_poliza
       LEFT JOIN pro_liquidaciones origen ON origen.correlativo = l.id_liq_origen
       LEFT JOIN pro_liquidaciones reemplazo ON reemplazo.id_liq_origen = l.correlativo
      WHERE l.correlativo = ? AND l.id_transportista IS NULL`,
    [id]
  );
  if (!liquidacion) throw errorNegocio('Liquidación no encontrada.', 404);

  const [detalles, vales] = await Promise.all([
    query(
      `SELECT d.*,
              ${oficial ? 'd.valor_vales' : 'd.valor_diesel'} AS valor_diesel,
              ${oficial ? 'd.impuesto_pct' : 'd.porcentaje_impuesto'} AS porcentaje_impuesto,
              t.nit, t.nombre_comercial
         FROM pro_liquidacion_detalle d
         JOIN man_transportista t ON t.codigo = d.id_transportista
        WHERE d.id_liquidacion = ?
        ORDER BY t.nombre_comercial`,
      [id]
    ),
    query(
      `SELECT d.correlativo, d.num_vale,
              ${oficial ? 'c.id_transportista' : 'd.id_transportista'} AS id_transportista,
              d.fecha,
              d.cantidad AS galones, f.factura, f.precio,
              COALESCE(d.total, d.cantidad * f.precio, 0) AS total
         FROM pro_detalle_facturas d
         ${oficial ? 'JOIN man_camion c ON c.codigo = d.id_camion' : ''}
         LEFT JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
        WHERE d.id_poliza = ? ${oficial ? '' : "AND UPPER(d.estado) <> 'ANULADO'"}
        ORDER BY id_transportista, d.fecha, d.correlativo`,
      [liquidacion.id_poliza]
    ),
  ]);
  const valesPorTransportista = new Map();
  vales.forEach((vale) => {
    const key = Number(vale.id_transportista);
    if (!valesPorTransportista.has(key)) valesPorTransportista.set(key, []);
    valesPorTransportista.get(key).push(vale);
  });
  return {
    liquidacion,
    transportistas: detalles.map((row) => ({
      ...row,
      vales: valesPorTransportista.get(Number(row.id_transportista)) || [],
    })),
  };
}

async function generar(idPoliza, idLiqOrigen = null, usuario = 'sistema') {
  const id = idValido(idPoliza, 'id_poliza');
  await validarPolizaParaGenerar(id);
  const oficial = await usaModeloOficial();
  const origen = idLiqOrigen ? idValido(idLiqOrigen, 'id_liq_origen') : null;
  if (oficial) {
    await query(
      'CALL sp_generar_liquidacion(?, 1, ?, ?, @liq_v2_num, @liq_v2_id, @liq_v2_mensaje)',
      [id, usuario || 'sistema', origen]
    );
  } else {
    await query('CALL sp_generar_liquidacion(?, ?)', [id, origen]);
  }
  const creada = await queryOne(
    `SELECT correlativo
       FROM pro_liquidaciones
      WHERE id_poliza = ? AND id_transportista IS NULL AND COALESCE(revertida, 0) = 0
      ORDER BY correlativo DESC LIMIT 1`,
    [id]
  );
  if (!creada) throw errorNegocio('El procedimiento no devolvió una liquidación activa.', 500);
  return detalleLiquidacion(creada.correlativo);
}

function filtrosHistorial(filtros = {}) {
  validarRango(filtros.fecha_inicio, filtros.fecha_fin);
  const condiciones = ['l.id_transportista IS NULL'];
  const params = [];
  if (filtros.id_poliza) { condiciones.push('l.id_poliza = ?'); params.push(idValido(filtros.id_poliza, 'id_poliza')); }
  if (filtros.id_transportista) {
    condiciones.push('d.id_transportista = ?');
    params.push(idValido(filtros.id_transportista, 'id_transportista'));
  }
  if (filtros.fecha_inicio) { condiciones.push('l.fecha_liquidacion >= ?'); params.push(filtros.fecha_inicio); }
  if (filtros.fecha_fin) { condiciones.push('l.fecha_liquidacion <= ?'); params.push(filtros.fecha_fin); }
  if (filtros.estado) {
    const estado = String(filtros.estado).toUpperCase();
    if (estado === 'REVERTIDA') condiciones.push('COALESCE(l.revertida, 0) = 1');
    else if (estado === 'LIQUIDADO') condiciones.push('COALESCE(l.revertida, 0) = 0');
    else { condiciones.push('UPPER(l.estado) = ?'); params.push(estado); }
  }
  return { condiciones, params };
}

async function historial(filtros = {}) {
  const oficial = await usaModeloOficial();
  const { condiciones, params } = filtrosHistorial(filtros);
  return query(
    `SELECT l.correlativo AS id_liquidacion, l.num_liquidacion, l.id_poliza,
            p.nombre_poliza, l.fecha_liquidacion, l.estado, l.revertida,
            l.usuario_graba, l.motivo_reversion, l.usuario_reversion, l.fecha_reversion,
            l.id_liq_origen, origen.num_liquidacion AS num_liquidacion_origen,
            reemplazo.num_liquidacion AS num_liquidacion_reemplazo,
            d.id_transportista, t.nit, t.nombre_comercial,
            d.cantidad_viajes, d.valor_viajes,
            ${oficial ? 'd.valor_vales' : 'd.valor_diesel'} AS valor_diesel,
            d.valor_anticipos, d.base_gravable,
            ${oficial ? 'd.impuesto_pct' : 'd.porcentaje_impuesto'} AS porcentaje_impuesto,
            d.valor_impuesto,
            d.total_facturar, d.total_galones, d.suministro,
            d.sobregiro_anterior, d.valor_liquidacion
       FROM pro_liquidaciones l
       JOIN man_poliza p ON p.codigo = l.id_poliza
       JOIN pro_liquidacion_detalle d ON d.id_liquidacion = l.correlativo
       JOIN man_transportista t ON t.codigo = d.id_transportista
       LEFT JOIN pro_liquidaciones origen ON origen.correlativo = l.id_liq_origen
       LEFT JOIN pro_liquidaciones reemplazo ON reemplazo.id_liq_origen = l.correlativo
      WHERE ${condiciones.join(' AND ')}
      ORDER BY l.fecha_liquidacion DESC, l.correlativo DESC, t.nombre_comercial`,
    params
  );
}

async function reversibles(busqueda = '') {
  const oficial = await usaModeloOficial();
  const term = String(busqueda || '').trim();
  const params = [];
  let filtro = '';
  if (term) {
    filtro = `AND (l.num_liquidacion LIKE ? OR p.nombre_poliza LIKE ? OR EXISTS (
      SELECT 1 FROM pro_liquidacion_detalle dx
      JOIN man_transportista tx ON tx.codigo = dx.id_transportista
      WHERE dx.id_liquidacion = l.correlativo AND tx.nombre_comercial LIKE ?
    ))`;
    params.push(`%${term}%`, `%${term}%`, `%${term}%`);
  }
  return query(
    `SELECT l.correlativo AS id_liquidacion, l.num_liquidacion, l.id_poliza,
            p.nombre_poliza, l.fecha_liquidacion, l.usuario_graba,
            COUNT(d.correlativo) AS transportistas,
            COALESCE(SUM(d.valor_liquidacion), 0) AS total_liquidacion
       FROM pro_liquidaciones l
       JOIN man_poliza p ON p.codigo = l.id_poliza
       LEFT JOIN pro_liquidacion_detalle d ON d.id_liquidacion = l.correlativo
      WHERE l.id_transportista IS NULL AND COALESCE(l.revertida, 0) = 0
        AND UPPER(l.estado) IN (${oficial ? "'PENDIENTE', 'PAGADA'" : "'LIQUIDADO'"}) ${filtro}
      GROUP BY l.correlativo, l.num_liquidacion, l.id_poliza, p.nombre_poliza,
               l.fecha_liquidacion, l.usuario_graba
      ORDER BY l.fecha_liquidacion DESC, l.correlativo DESC`,
    params
  );
}

async function revertir(idLiquidacion, usuario, motivo) {
  const id = idValido(idLiquidacion, 'id_liquidacion');
  const oficial = await usaModeloOficial();
  const razon = String(motivo || '').trim();
  if (razon.length < 5) throw errorNegocio('El motivo de reversión es obligatorio (mínimo 5 caracteres).', 400);
  await query(
    'CALL sp_revertir_liquidacion(?, ?, ?)',
    oficial ? [id, razon, usuario || 'sistema'] : [id, usuario || 'sistema', razon]
  );
  return detalleLiquidacion(id);
}

async function sobregiros() {
  const oficial = await usaModeloOficial();
  if (oficial) {
    return query(
      `SELECT t.codigo AS id_transportista, t.nit, t.nombre_comercial,
              COALESCE(SUM(CASE WHEN UPPER(s.estado) <> 'CANCELADO' THEN s.monto_sobregiro ELSE 0 END), 0) AS sobregiro_total,
              COALESCE(SUM(CASE WHEN UPPER(s.estado) <> 'CANCELADO' THEN s.monto_aplicado ELSE 0 END), 0) AS total_abonado,
              COALESCE(SUM(CASE WHEN UPPER(s.estado) <> 'CANCELADO' THEN s.saldo_pendiente ELSE 0 END), 0) AS saldo_pendiente,
              CASE WHEN COALESCE(SUM(CASE WHEN UPPER(s.estado) <> 'CANCELADO' THEN s.saldo_pendiente ELSE 0 END), 0) <= 0
                   THEN 'CUBIERTO' ELSE 'PENDIENTE' END AS estado
         FROM man_transportista t
         JOIN pro_sobregiro_transportista s ON s.id_transportista = t.codigo
        GROUP BY t.codigo, t.nit, t.nombre_comercial
        ORDER BY saldo_pendiente DESC, t.nombre_comercial`
    );
  }
  return query(
    `SELECT t.codigo AS id_transportista, t.nit, t.nombre_comercial,
            COALESCE(SUM(CASE WHEN UPPER(s.estado) <> 'ANULADO' THEN s.valor_sobregiro ELSE 0 END), 0) AS sobregiro_total,
            COALESCE(SUM(CASE WHEN UPPER(s.estado) <> 'ANULADO' THEN s.valor_abonado ELSE 0 END), 0) AS total_abonado,
            COALESCE(SUM(CASE WHEN UPPER(s.estado) <> 'ANULADO' THEN s.valor_sobregiro - s.valor_abonado ELSE 0 END), 0) AS saldo_pendiente,
            CASE WHEN COALESCE(SUM(CASE WHEN UPPER(s.estado) <> 'ANULADO' THEN s.valor_sobregiro - s.valor_abonado ELSE 0 END), 0) <= 0
                 THEN 'CUBIERTO' ELSE 'PENDIENTE' END AS estado
       FROM man_transportista t
       JOIN pro_sobregiro_transportista s ON s.id_transportista = t.codigo
      GROUP BY t.codigo, t.nit, t.nombre_comercial
      ORDER BY saldo_pendiente DESC, t.nombre_comercial`
  );
}

async function abonos(idTransportista) {
  const id = idValido(idTransportista, 'id_transportista');
  const oficial = await usaModeloOficial();
  if (oficial) {
    return query(
      `SELECT a.correlativo, DATE(a.fecha_hora_graba) AS fecha, a.monto,
              a.descripcion AS forma_pago, NULL AS referencia,
              a.usuario_graba, a.fecha_hora_graba
         FROM pro_abonos_transportista a
        WHERE a.id_transportista = ? AND UPPER(a.estado) = 'ACTIVO'
        ORDER BY a.fecha_hora_graba DESC, a.correlativo DESC`,
      [id]
    );
  }
  return query(
    `SELECT a.correlativo, a.fecha, a.monto, a.forma_pago, a.referencia,
            a.usuario_graba, a.fecha_hora_graba
       FROM pro_abonos_transportista a
      WHERE a.id_transportista = ?
      ORDER BY a.fecha DESC, a.correlativo DESC`,
    [id]
  );
}

async function registrarAbono(data, usuario) {
  const id = idValido(data.id_transportista, 'id_transportista');
  const monto = Number(data.monto);
  if (!Number.isFinite(monto) || monto <= 0) throw errorNegocio('El monto debe ser mayor que cero.', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.fecha || ''))) throw errorNegocio('La fecha es obligatoria.', 400);
  const formaPago = String(data.forma_pago || '').trim();
  if (!formaPago) throw errorNegocio('La forma de pago es obligatoria.', 400);

  const oficial = await usaModeloOficial();
  const saldo = await queryOne(
    `SELECT COALESCE(SUM(${oficial ? 'saldo_pendiente' : 'valor_sobregiro - valor_abonado'}), 0) AS saldo
       FROM pro_sobregiro_transportista
      WHERE id_transportista = ? AND UPPER(estado) = 'PENDIENTE'`,
    [id]
  );
  if (monto > Number(saldo?.saldo || 0)) throw errorNegocio('El monto no puede exceder el saldo pendiente.', 400);
  await query('CALL sp_registrar_abono(?, ?, ?, ?)', [id, money(monto), data.fecha, formaPago]);
  const rows = await sobregiros();
  return {
    sobregiro: rows.find((row) => Number(row.id_transportista) === id) || null,
    usuario: usuario || 'sistema',
  };
}

async function reporte(filtros = {}) {
  const items = await historial(filtros);
  const activos = items.filter((row) => !Number(row.revertida));
  return {
    items,
    totales: {
      total_pagar: money(activos.reduce((sum, row) => sum + Number(row.valor_liquidacion || 0), 0)),
      sobregiros_generados: money(activos.reduce(
        (sum, row) => sum + Math.max(0, -Number(row.valor_liquidacion || 0)), 0
      )),
    },
  };
}

module.exports = {
  polizasDisponibles,
  vistaPrevia,
  generar,
  detalleLiquidacion,
  historial,
  reversibles,
  revertir,
  sobregiros,
  abonos,
  registrarAbono,
  reporte,
};
