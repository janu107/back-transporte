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

/**
 * ¿Existe una columna en el esquema actual? El resultado se memoriza por
 * tabla.columna (el esquema no cambia mientras el proceso vive).
 *
 * Cada diferencia de esquema se consulta por separado a propósito: el servidor
 * de producción resultó ser un HÍBRIDO (usa el modelo oficial de liquidaciones
 * pero conserva con_parametros con columnas nombradas), así que atar todas las
 * variantes a una sola bandera provocaba errores en cascada.
 */
const columnaCache = new Map();
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

/** Modelo oficial de liquidaciones: el desglose usa valor_vales / impuesto_pct. */
function usaModeloOficial() {
  return existeColumna('pro_liquidacion_detalle', 'valor_vales');
}

/**
 * Consulta del valor del galón, adaptada al formato real de con_parametros:
 * columnas nombradas (valor_galon_combustible) o tabla llave-valor (clave/valor).
 */
async function sqlValorGalon() {
  if (await existeColumna('con_parametros', 'valor_galon_combustible')) {
    return `SELECT COALESCE(valor_galon_combustible, 0) AS valor_suministro
              FROM con_parametros ORDER BY codigo LIMIT 1`;
  }
  return `SELECT COALESCE(CAST(valor AS DECIMAL(14,4)), 0) AS valor_suministro
            FROM con_parametros WHERE clave = 'valor_galon_combustible' LIMIT 1`;
}

/** Saldo pendiente de sobregiros, según las columnas que exponga la tabla. */
async function sqlSaldoSobregiro() {
  return (await existeColumna('pro_sobregiro_transportista', 'saldo_pendiente'))
    ? 'saldo_pendiente'
    : 'valor_sobregiro - valor_abonado';
}

/**
 * Expresión del transportista de un viaje/vale. Si la tabla de detalle tiene su
 * propia columna se prefiere esa; si no, se resuelve por el camión.
 */
async function sqlTransportistaDe(tabla, aliasDetalle, aliasCamion) {
  return (await existeColumna(tabla, 'id_transportista'))
    ? `COALESCE(${aliasDetalle}.id_transportista, ${aliasCamion}.id_transportista)`
    : `${aliasCamion}.id_transportista`;
}

function validarRango(fechaInicio, fechaFin) {
  if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
    throw errorNegocio('La fecha de inicio no puede ser posterior a la fecha final.', 400);
  }
}

/**
 * Filtro que aísla los ENCABEZADOS de liquidación v2.
 *
 * En el modelo local, pro_liquidaciones guarda tanto las filas históricas del
 * modelo anterior (una por transportista, con id_transportista) como los
 * encabezados v2 (id_transportista NULL), así que hay que distinguirlos.
 * En el modelo oficial de producción esa columna NO existe: la tabla es solo
 * de encabezados y el desglose vive en pro_liquidacion_detalle. Referenciarla
 * ahí provocaba "Unknown column 'l.id_transportista' in 'where clause'".
 *
 * @param {boolean} oficial resultado de usaModeloOficial()
 * @param {string} alias alias de pro_liquidaciones en la consulta
 * @returns {string} condición SQL lista para concatenar (vacía en el modelo oficial)
 */
function filtroEncabezado(oficial, alias = 'l') {
  return oficial ? '' : `AND ${alias}.id_transportista IS NULL`;
}

async function polizasDisponibles() {
  const oficial = await usaModeloOficial();
  const estadosPoliza = oficial ? "('ABIERTA')" : "('CERRADA', 'CERRADA SIN LIQUIDAR')";
  const estadosActivos = oficial ? "('PENDIENTE', 'PAGADA')" : "('LIQUIDADO')";
  return query(
    `SELECT p.codigo, p.nombre_poliza, p.fecha, p.estado,
            (SELECT lr.correlativo
               FROM pro_liquidaciones lr
              WHERE lr.id_poliza = p.codigo ${filtroEncabezado(oficial, 'lr')}
                AND COALESCE(lr.revertida, 0) = 1
              ORDER BY lr.correlativo DESC LIMIT 1) AS id_liq_origen
       FROM man_poliza p
      WHERE UPPER(p.estado) IN ${estadosPoliza}
        AND NOT EXISTS (
          SELECT 1
            FROM pro_liquidaciones l
           WHERE l.id_poliza = p.codigo
             ${filtroEncabezado(oficial, 'l')}
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
       FROM pro_liquidaciones l
      WHERE l.id_poliza = ? ${filtroEncabezado(oficial, 'l')} AND COALESCE(l.revertida, 0) = 0
        AND UPPER(l.estado) IN (${oficial ? "'PENDIENTE', 'PAGADA'" : "'LIQUIDADO'"})
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

  // Expresiones adaptadas al esquema real (ver existeColumna): así funciona
  // igual en el modelo local, en el oficial y en híbridos como producción.
  const transpViaje = await sqlTransportistaDe('pro_poliza_detalle', 'd', 'c');
  const transpVale = await sqlTransportistaDe('pro_detalle_facturas', 'd', 'c');
  const saldoSobregiro = await sqlSaldoSobregiro();
  const valorGalonSql = await sqlValorGalon();

  const consultas = [
    query(
      `SELECT ${transpViaje} AS id_transportista, COUNT(*) AS cantidad_viajes,
              COALESCE(SUM(d.valor), 0) AS valor_viajes
         FROM pro_poliza_detalle d
         LEFT JOIN man_camion c ON c.codigo = d.id_camion
        WHERE d.id_poliza = ? AND UPPER(d.estado) NOT IN ('ANULADO', 'ANULADA')
        GROUP BY ${transpViaje}`,
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
      `SELECT d.correlativo, d.num_vale, ${transpVale} AS id_transportista, d.fecha,
              d.cantidad AS galones, f.factura, f.precio,
              COALESCE(d.total, d.cantidad * f.precio, 0) AS total
         FROM pro_detalle_facturas d
         LEFT JOIN man_camion c ON c.codigo = d.id_camion
         LEFT JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
        WHERE d.id_poliza = ? AND UPPER(COALESCE(d.estado, 'ACTIVO')) NOT IN ('ANULADO', 'ANULADA')
        ORDER BY id_transportista, d.fecha, d.correlativo`,
      [id]
    ),
    query(
      `SELECT id_transportista, COALESCE(SUM(${saldoSobregiro}), 0) AS saldo
         FROM pro_sobregiro_transportista
        WHERE UPPER(estado) = 'PENDIENTE'
        GROUP BY id_transportista`
    ),
    queryOne(valorGalonSql),
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
      WHERE l.correlativo = ? ${filtroEncabezado(oficial, 'l')}`,
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
              ${await sqlTransportistaDe('pro_detalle_facturas', 'd', 'c')} AS id_transportista,
              d.fecha,
              d.cantidad AS galones, f.factura, f.precio,
              COALESCE(d.total, d.cantidad * f.precio, 0) AS total
         FROM pro_detalle_facturas d
         LEFT JOIN man_camion c ON c.codigo = d.id_camion
         LEFT JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
        WHERE d.id_poliza = ? AND UPPER(COALESCE(d.estado, 'ACTIVO')) NOT IN ('ANULADO', 'ANULADA')
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

/**
 * generar
 * @param {number} idPoliza
 * @param {number|null} idLiqOrigen liquidación revertida que ésta reemplaza
 * @param {string} usuario
 * @param {boolean} aplicaSobregiro  true (por defecto): descuenta el sobregiro
 *   anterior en esta liquidación. false: NO lo descuenta y el saldo queda
 *   pendiente para aplicarse en la siguiente póliza del transportista.
 */
async function generar(idPoliza, idLiqOrigen = null, usuario = 'sistema', aplicaSobregiro = true) {
  const id = idValido(idPoliza, 'id_poliza');
  await validarPolizaParaGenerar(id);
  const oficial = await usaModeloOficial();
  const origen = idLiqOrigen ? idValido(idLiqOrigen, 'id_liq_origen') : null;
  const aplica = aplicaSobregiro === false ? 0 : 1;
  if (oficial) {
    await query(
      'CALL sp_generar_liquidacion(?, ?, ?, ?, @liq_v2_num, @liq_v2_id, @liq_v2_mensaje)',
      [id, aplica, usuario || 'sistema', origen]
    );
  } else {
    await query('CALL sp_generar_liquidacion(?, ?)', [id, origen]);
  }
  const creada = await queryOne(
    `SELECT correlativo
       FROM pro_liquidaciones l
      WHERE l.id_poliza = ? ${filtroEncabezado(oficial, 'l')} AND COALESCE(l.revertida, 0) = 0
      ORDER BY l.correlativo DESC LIMIT 1`,
    [id]
  );
  if (!creada) throw errorNegocio('El procedimiento no devolvió una liquidación activa.', 500);
  return detalleLiquidacion(creada.correlativo);
}

function filtrosHistorial(filtros = {}, oficial = false) {
  validarRango(filtros.fecha_inicio, filtros.fecha_fin);
  // En el modelo oficial no existe l.id_transportista; toda fila ya es encabezado.
  const condiciones = oficial ? ['1 = 1'] : ['l.id_transportista IS NULL'];
  const params = [];
  if (filtros.id_poliza) { condiciones.push('l.id_poliza = ?'); params.push(idValido(filtros.id_poliza, 'id_poliza')); }
  if (filtros.id_transportista) {
    condiciones.push('d.id_transportista = ?');
    params.push(idValido(filtros.id_transportista, 'id_transportista'));
  }
  // Búsqueda por número de liquidación (coincidencia parcial).
  if (filtros.num_liquidacion) {
    condiciones.push('l.num_liquidacion LIKE ?');
    params.push(`%${String(filtros.num_liquidacion).trim()}%`);
  }
  // Liquidación puntual por su correlativo.
  if (filtros.id_liquidacion) {
    condiciones.push('l.correlativo = ?');
    params.push(idValido(filtros.id_liquidacion, 'id_liquidacion'));
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
  const { condiciones, params } = filtrosHistorial(filtros, oficial);
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
      WHERE COALESCE(l.revertida, 0) = 0 ${filtroEncabezado(oficial, 'l')}
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
  // Nombres de columna según el esquema real (producción y desarrollo difieren).
  const usaMonto = await existeColumna('pro_sobregiro_transportista', 'monto_sobregiro');
  const colTotal = usaMonto ? 's.monto_sobregiro' : 's.valor_sobregiro';
  const colAbonado = usaMonto ? 's.monto_aplicado' : 's.valor_abonado';
  const colSaldo = (await existeColumna('pro_sobregiro_transportista', 'saldo_pendiente'))
    ? 's.saldo_pendiente'
    : 's.valor_sobregiro - s.valor_abonado';
  const excluido = usaMonto ? 'CANCELADO' : 'ANULADO';
  const vivo = (expr) => `COALESCE(SUM(CASE WHEN UPPER(s.estado) <> '${excluido}' THEN ${expr} ELSE 0 END), 0)`;

  return query(
    `SELECT t.codigo AS id_transportista, t.nit, t.nombre_comercial,
            ${vivo(colTotal)} AS sobregiro_total,
            ${vivo(colAbonado)} AS total_abonado,
            ${vivo(colSaldo)} AS saldo_pendiente,
            CASE WHEN ${vivo(colSaldo)} <= 0 THEN 'CUBIERTO' ELSE 'PENDIENTE' END AS estado
       FROM man_transportista t
       JOIN pro_sobregiro_transportista s ON s.id_transportista = t.codigo
      GROUP BY t.codigo, t.nit, t.nombre_comercial
      ORDER BY saldo_pendiente DESC, t.nombre_comercial`
  );
}

async function abonos(idTransportista) {
  const id = idValido(idTransportista, 'id_transportista');
  // La tabla de abonos tiene dos variantes: fecha/forma_pago/referencia propias,
  // o descripcion + fecha_hora_graba.
  const tieneFecha = await existeColumna('pro_abonos_transportista', 'fecha');
  const tieneEstado = await existeColumna('pro_abonos_transportista', 'estado');
  const colFecha = tieneFecha ? 'a.fecha' : 'DATE(a.fecha_hora_graba)';
  const colForma = (await existeColumna('pro_abonos_transportista', 'forma_pago'))
    ? 'a.forma_pago' : 'a.descripcion';
  const colRef = (await existeColumna('pro_abonos_transportista', 'referencia'))
    ? 'a.referencia' : 'NULL';

  return query(
    `SELECT a.correlativo, ${colFecha} AS fecha, a.monto,
            ${colForma} AS forma_pago, ${colRef} AS referencia,
            a.usuario_graba, a.fecha_hora_graba
       FROM pro_abonos_transportista a
      WHERE a.id_transportista = ?${tieneEstado ? " AND UPPER(a.estado) = 'ACTIVO'" : ''}
      ORDER BY a.fecha_hora_graba DESC, a.correlativo DESC`,
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

  const saldo = await queryOne(
    `SELECT COALESCE(SUM(${await sqlSaldoSobregiro()}), 0) AS saldo
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

/**
 * reporteDetallado — documento "Liquidación a Transportistas" del módulo v2.
 * Por cada transportista de la liquidación arma el detalle de sus viajes
 * (cartas de porte / viajes locales), sus anticipos y sus vales de diesel,
 * más el bloque de totales guardado en pro_liquidacion_detalle (valores
 * originales; no se recalculan para no alterar históricos).
 */
async function reporteDetallado(idLiquidacion) {
  const id = idValido(idLiquidacion, 'id_liquidacion');
  const { liquidacion, transportistas } = await detalleLiquidacion(id);

  // El transportista se resuelve según el esquema real (columna propia o camión).
  const transpViaje = await sqlTransportistaDe('pro_poliza_detalle', 'd', 'c');
  const transpVale = await sqlTransportistaDe('pro_detalle_facturas', 'd', 'c');

  const [viajes, anticipos, vales] = await Promise.all([
    query(
      `SELECT ${transpViaje} AS id_transportista,
              d.num_envio, d.fecha, d.tipo, d.peso, d.valor,
              cam.placa,
              TRIM(CONCAT(p.nombres, ' ', COALESCE(p.apellidos, ''))) AS piloto,
              te.origen AS embarque, te.destino
         FROM pro_poliza_detalle d
         LEFT JOIN man_camion c ON c.codigo = d.id_camion
         LEFT JOIN man_camion cam ON cam.codigo = d.id_camion
         LEFT JOIN man_pilotos p ON p.codigo = d.id_piloto
         LEFT JOIN cat_tarifa_embarque te ON te.codigo = d.id_tarifa_embarque
        WHERE d.id_poliza = ? AND UPPER(d.estado) NOT IN ('ANULADO', 'ANULADA')
        ORDER BY d.fecha, d.correlativo`,
      [liquidacion.id_poliza]
    ),
    query(
      `SELECT a.id_transportista, a.num_anticipo, a.fecha, a.descripcion, a.valor
         FROM pro_anticipo_provision a
        WHERE a.id_poliza = ? AND UPPER(a.estado) NOT IN ('ANULADO', 'ANULADA')
        ORDER BY a.fecha, a.correlativo`,
      [liquidacion.id_poliza]
    ),
    query(
      `SELECT ${transpVale} AS id_transportista,
              d.num_vale, d.fecha, d.cantidad AS galones, f.precio,
              COALESCE(d.total, d.cantidad * f.precio, 0) AS total
         FROM pro_detalle_facturas d
         LEFT JOIN man_camion c ON c.codigo = d.id_camion
         LEFT JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
        WHERE d.id_poliza = ? AND UPPER(COALESCE(d.estado, 'ACTIVO')) NOT IN ('ANULADO', 'ANULADA')
        ORDER BY d.fecha, d.correlativo`,
      [liquidacion.id_poliza]
    ),
  ]);

  const agrupar = (rows) => {
    const mapa = new Map();
    rows.forEach((row) => {
      const key = Number(row.id_transportista);
      if (!key) return;
      if (!mapa.has(key)) mapa.set(key, []);
      mapa.get(key).push(row);
    });
    return mapa;
  };
  const mViajes = agrupar(viajes);
  const mAnticipos = agrupar(anticipos);
  const mVales = agrupar(vales);

  return {
    liquidacion,
    transportistas: transportistas.map((t) => {
      const key = Number(t.id_transportista);
      return {
        id_transportista: key,
        nit: t.nit || '',
        nombre: t.nombre_comercial || '',
        viajes: (mViajes.get(key) || []).map((v) => ({
          c_porte: v.num_envio,
          fecha: v.fecha,
          tipo: v.tipo || '',
          piloto: (v.piloto || '').trim(),
          placa: v.placa || '',
          peso: money(v.peso),
          total_pago: money(v.valor),
          embarque: v.embarque || '',
          destino: v.destino || '',
        })),
        anticipos: (mAnticipos.get(key) || []).map((a) => ({
          num: a.num_anticipo, fecha: a.fecha,
          descripcion: a.descripcion || '', valor: money(a.valor),
        })),
        diesel: (mVales.get(key) || []).map((c) => ({
          num_vale: c.num_vale, fecha: c.fecha,
          galones: money(c.galones), precio: money(c.precio), total: money(c.total),
        })),
        totales: {
          cantidad_viajes: Number(t.cantidad_viajes || 0),
          valor_viajes: money(t.valor_viajes),
          valor_diesel: money(t.valor_diesel),
          total_galones: money(t.total_galones),
          valor_anticipos: money(t.valor_anticipos),
          base_gravable: money(t.base_gravable),
          porcentaje_impuesto: Number(t.porcentaje_impuesto || 0),
          valor_impuesto: money(t.valor_impuesto),
          total_facturar: money(t.total_facturar),
          suministro: money(t.suministro),
          sobregiro_anterior: money(t.sobregiro_anterior),
          total_pagar: money(t.valor_liquidacion),
        },
      };
    }),
  };
}

/**
 * resumenPorTransportista — reporte de RESUMEN por liquidación de transportista.
 * INGRESOS:   cantidad de viajes, total de peso, valor en carta de porte / viajes locales.
 * DESCUENTOS: valor de anticipos, valor de diesel, cantidad de galones, total a facturar.
 * Acepta los mismos filtros que el historial (transportista, póliza, fechas, estado).
 */
async function resumenPorTransportista(filtros = {}) {
  const items = await historial(filtros);
  const activos = items.filter((row) => !Number(row.revertida));
  if (!activos.length) return { items: [], totales: null };

  const transpViaje = await sqlTransportistaDe('pro_poliza_detalle', 'd', 'c');

  // Peso y valor por tipo de viaje: no viven en pro_liquidacion_detalle, se
  // agregan desde los envíos de cada póliza liquidada.
  const polizas = [...new Set(activos.map((row) => Number(row.id_poliza)))];
  const pesos = await query(
    `SELECT d.id_poliza, ${transpViaje} AS id_transportista,
            COALESCE(SUM(d.peso), 0) AS total_peso,
            COALESCE(SUM(CASE WHEN UPPER(COALESCE(d.tipo, '')) LIKE '%LOCAL%'
                              THEN d.valor ELSE 0 END), 0) AS valor_locales,
            COALESCE(SUM(CASE WHEN UPPER(COALESCE(d.tipo, '')) LIKE '%LOCAL%'
                              THEN 0 ELSE d.valor END), 0) AS valor_carta_porte
       FROM pro_poliza_detalle d
       LEFT JOIN man_camion c ON c.codigo = d.id_camion
      WHERE d.id_poliza IN (${polizas.map(() => '?').join(',')})
        AND UPPER(d.estado) NOT IN ('ANULADO', 'ANULADA')
      GROUP BY d.id_poliza, ${transpViaje}`,
    polizas
  );
  const clave = (poliza, transportista) => `${Number(poliza)}|${Number(transportista)}`;
  const mapaPesos = new Map(pesos.map((row) => [clave(row.id_poliza, row.id_transportista), row]));

  const filas = activos.map((row) => {
    const extra = mapaPesos.get(clave(row.id_poliza, row.id_transportista)) || {};
    return {
      num_liquidacion: row.num_liquidacion,
      fecha_liquidacion: row.fecha_liquidacion,
      nombre_poliza: row.nombre_poliza,
      id_transportista: Number(row.id_transportista),
      nit: row.nit || '',
      nombre_comercial: row.nombre_comercial || '',
      // Ingresos
      cantidad_viajes: Number(row.cantidad_viajes || 0),
      total_peso: money(extra.total_peso),
      valor_carta_porte: money(extra.valor_carta_porte),
      valor_locales: money(extra.valor_locales),
      valor_viajes: money(row.valor_viajes),
      // Descuentos
      valor_anticipos: money(row.valor_anticipos),
      valor_diesel: money(row.valor_diesel),
      total_galones: money(row.total_galones),
      total_facturar: money(row.total_facturar),
      valor_liquidacion: money(row.valor_liquidacion),
    };
  });

  const suma = (campo) => money(filas.reduce((acc, row) => acc + Number(row[campo] || 0), 0));
  return {
    items: filas,
    totales: {
      cantidad_viajes: filas.reduce((acc, row) => acc + row.cantidad_viajes, 0),
      total_peso: suma('total_peso'),
      valor_carta_porte: suma('valor_carta_porte'),
      valor_locales: suma('valor_locales'),
      valor_viajes: suma('valor_viajes'),
      valor_anticipos: suma('valor_anticipos'),
      valor_diesel: suma('valor_diesel'),
      total_galones: suma('total_galones'),
      total_facturar: suma('total_facturar'),
      valor_liquidacion: suma('valor_liquidacion'),
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
  reporteDetallado,
  resumenPorTransportista,
};
