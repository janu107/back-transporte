/**
 * liquidacion.service.js — LIQUIDACIÓN DE PÓLIZAS.
 *
 * resumenPoliza(idPoliza): calcula (sin guardar) el líquido por transportista.
 * confirmar(idPoliza, usuario): guarda liquidaciones, aplica/genera sobregiros y
 *   cierra la póliza, todo dentro de una transacción idempotente.
 *
 * Fórmulas:
 *   valor_combustible = SUM(pro_detalle_facturas.cantidad) × valor_galon_combustible
 *   total_descuentos  = valor_combustible + valor_anticipos + valor_aceite
 *                        + valor_administrativo + sobregiro_anterior
 *   liquido           = valor_viajes − total_descuentos
 *
 * [v5] valor_aceite y valor_administrativo salen de pro_descuento_aceite /
 * pro_descuento_administrativo (estado ACTIVO), tablas de captura manual —
 * no existe otra fuente de estos montos en el sistema.
 *
 * Para evitar multiplicar filas (relaciones 1→N con viajes, anticipos y combustible)
 * NO se hace un JOIN plano: se agrupa cada fuente por transportista por separado y
 * se combinan en memoria.
 */
const { query, queryOne, withTransaction } = require('../database/db');
const { siguienteCorrelativo } = require('../utils/correlativo');

const ESTADO_VIAJE_ACTIVO = 'ACTIVO';
const ESTADO_ANTICIPO_ACTIVO = 'ACTIVO';
const QQ_A_KG = 45.359237; // 1 quintal = 45.359237 kg (igual que en reporteArrastre)

function errorNegocio(mensaje, status = 409) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

const money = (v) => Number(Number(v || 0).toFixed(2));

/** Obtiene el valor del galón desde parámetros (fila única). */
async function valorGalon(runner = query) {
  const rows = await runner('SELECT valor_galon_combustible AS v FROM con_parametros WHERE codigo = 1');
  const r = Array.isArray(rows) ? rows[0] : rows;
  return Number(r?.v || 0);
}

/**
 * Construye el resumen por transportista para una póliza.
 * @param {number} idPoliza
 * @param {function} runner  query() del pool o de la conexión de la transacción
 */
async function construirResumen(idPoliza, runner = query) {
  const galon = await valorGalon(runner);

  // Agrupados por transportista (cada fuente por separado -> sin filas multiplicadas).
  const viajes = await runner(
    `SELECT id_transportista, COUNT(*) AS cnt, COALESCE(SUM(valor),0) AS val
       FROM pro_poliza_detalle
      WHERE id_poliza = ? AND estado = ?
      GROUP BY id_transportista`,
    [idPoliza, ESTADO_VIAJE_ACTIVO]
  );
  const anticipos = await runner(
    `SELECT id_transportista, COUNT(*) AS cnt, COALESCE(SUM(valor),0) AS val
       FROM pro_anticipo_provision
      WHERE id_poliza = ? AND estado = ?
      GROUP BY id_transportista`,
    [idPoliza, ESTADO_ANTICIPO_ACTIVO]
  );
  const combustible = await runner(
    `SELECT id_transportista, COUNT(*) AS cnt, COALESCE(SUM(cantidad),0) AS galones
       FROM pro_detalle_facturas
      WHERE id_poliza = ? AND estado <> 'ANULADO'
      GROUP BY id_transportista`,
    [idPoliza]
  );
  // [v5] Descuentos de aceite y administrativos (captura manual, estado ACTIVO).
  const aceite = await runner(
    `SELECT id_transportista, COALESCE(SUM(valor),0) AS val
       FROM pro_descuento_aceite
      WHERE id_poliza = ? AND estado = 'ACTIVO'
      GROUP BY id_transportista`,
    [idPoliza]
  );
  const administrativo = await runner(
    `SELECT id_transportista, COALESCE(SUM(valor),0) AS val
       FROM pro_descuento_administrativo
      WHERE id_poliza = ? AND estado = 'ACTIVO'
      GROUP BY id_transportista`,
    [idPoliza]
  );
  // Sobregiros PENDIENTES de cualquier póliza anterior, por transportista.
  const sobregiros = await runner(
    `SELECT id_transportista, COALESCE(SUM(valor_sobregiro),0) AS val
       FROM pro_sobregiro_transportista
      WHERE estado = 'PENDIENTE'
      GROUP BY id_transportista`
  );

  const map = new Map();
  const ensure = (id) => {
    const k = Number(id);
    if (!map.has(k)) {
      map.set(k, {
        id_transportista: k, cantidad_viajes: 0, valor_viajes: 0,
        cantidad_anticipos: 0, valor_anticipos: 0, cantidad_vale: 0,
        total_galones: 0, valor_galon: galon, valor_combustible: 0,
        valor_aceite: 0, valor_administrativo: 0,
        sobregiro_anterior: 0,
      });
    }
    return map.get(k);
  };

  viajes.forEach((r) => { const t = ensure(r.id_transportista); t.cantidad_viajes = Number(r.cnt); t.valor_viajes = money(r.val); });
  anticipos.forEach((r) => { const t = ensure(r.id_transportista); t.cantidad_anticipos = Number(r.cnt); t.valor_anticipos = money(r.val); });
  combustible.forEach((r) => { const t = ensure(r.id_transportista); t.cantidad_vale = Number(r.cnt); t.total_galones = money(r.galones); t.valor_combustible = money(Number(r.galones) * galon); });
  aceite.forEach((r) => { const t = ensure(r.id_transportista); t.valor_aceite = money(r.val); });
  administrativo.forEach((r) => { const t = ensure(r.id_transportista); t.valor_administrativo = money(r.val); });
  // El sobregiro sólo aplica a transportistas con movimientos en esta póliza.
  sobregiros.forEach((r) => { const k = Number(r.id_transportista); if (map.has(k)) map.get(k).sobregiro_anterior = money(r.val); });

  const ids = [...map.keys()];
  if (ids.length === 0) return [];

  // Datos del transportista (NIT + nombre) en una sola consulta.
  const placeholders = ids.map(() => '?').join(',');
  const datos = await runner(
    `SELECT codigo, nit, nombre_comercial FROM man_transportista WHERE codigo IN (${placeholders})`,
    ids
  );
  const datosMap = new Map(datos.map((d) => [Number(d.codigo), d]));

  return ids.map((id) => {
    const t = map.get(id);
    const d = datosMap.get(id) || {};
    const total_descuentos = money(
      t.valor_combustible + t.valor_anticipos + t.valor_aceite + t.valor_administrativo + t.sobregiro_anterior
    );
    const liquido = money(t.valor_viajes - total_descuentos);
    return {
      id_transportista: id,
      nit: d.nit || '',
      nombre: d.nombre_comercial || '',
      cantidad_viajes: t.cantidad_viajes,
      valor_viajes: t.valor_viajes,
      cantidad_anticipos: t.cantidad_anticipos,
      valor_anticipos: t.valor_anticipos,
      cantidad_vale: t.cantidad_vale,
      total_galones: t.total_galones,
      valor_galon: t.valor_galon,
      valor_combustible: t.valor_combustible,
      valor_aceite: t.valor_aceite,
      valor_administrativo: t.valor_administrativo,
      sobregiro_anterior: t.sobregiro_anterior,
      total_descuentos,
      liquido,
    };
  });
}

/** Valida que la póliza exista y esté ABIERTA; devuelve la fila. */
async function polizaAbierta(idPoliza, runner = query, forUpdate = false) {
  const sql = `SELECT codigo, nombre_poliza, estado FROM man_poliza WHERE codigo = ?${forUpdate ? ' FOR UPDATE' : ''}`;
  const rows = await runner(sql, [idPoliza]);
  const p = Array.isArray(rows) ? rows[0] : rows;
  if (!p) throw errorNegocio('Póliza no encontrada.', 404);
  if (String(p.estado).toUpperCase() !== 'ABIERTA') {
    throw errorNegocio(`La póliza no está ABIERTA (estado: ${p.estado}). No se puede liquidar.`, 409);
  }
  return p;
}

/** GET resumen — no modifica nada. */
async function resumenPoliza(idPoliza) {
  const id = Number(idPoliza);
  if (!id) throw errorNegocio('id_poliza inválido.', 400);
  const poliza = await polizaAbierta(id);
  const transportistas = await construirResumen(id);
  return { id_poliza: id, nombre_poliza: poliza.nombre_poliza, transportistas };
}

/** POST confirmar — transaccional e idempotente. Cierra la póliza. */
async function confirmar(idPoliza, usuario) {
  const id = Number(idPoliza);
  if (!id) throw errorNegocio('id_poliza inválido.', 400);
  const user = usuario || 'sistema';

  return withTransaction(async (conn) => {
    const runner = (sql, params = []) => conn.query(sql, params).then(([rows]) => rows);

    // Bloquea la póliza y valida estado (evita doble liquidación concurrente).
    await polizaAbierta(id, runner, true);

    // Idempotencia: si ya hay liquidaciones para esta póliza, no repetir.
    const yaLiq = await runner('SELECT COUNT(*) AS n FROM pro_liquidaciones WHERE id_poliza = ?', [id]);
    if (Number(yaLiq[0].n) > 0) throw errorNegocio('La póliza ya fue liquidada.', 409);

    const resumen = await construirResumen(id, runner);
    const anio = new Date().getFullYear();
    const hoy = new Date().toISOString().slice(0, 10);

    let generados = 0;
    let totalLiquido = 0;

    for (const t of resumen) {
      const numLiq = await siguienteCorrelativo(conn, 'pro_liquidaciones', 'num_liquidacion', anio);
      await conn.query(
        `INSERT INTO pro_liquidaciones
           (num_liquidacion, id_poliza, id_transportista, cantidad_viajes, valor_viajes,
            cantidad_vale, valor_vales, valor_aceite, valor_administrativo, sobregiro_anterior,
            cantidad_anticipos, valor_anticipos, valor_liquidacion, estado, fecha_liquidacion, usuario_graba)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        // pro_liquidaciones.estado en el server es ENUM('PENDIENTE','PAGADA','ANULADA');
        // la liquidación se registra PENDIENTE (de pago). La póliza sí se cierra LIQUIDADA.
        [numLiq, id, t.id_transportista, t.cantidad_viajes, t.valor_viajes,
          t.cantidad_vale, t.valor_combustible, t.valor_aceite, t.valor_administrativo, t.sobregiro_anterior,
          t.cantidad_anticipos, t.valor_anticipos, t.liquido, 'PENDIENTE', hoy, user]
      );

      // Aplica los sobregiros anteriores de ese transportista.
      if (t.sobregiro_anterior > 0) {
        await conn.query(
          `UPDATE pro_sobregiro_transportista
              SET estado = 'APLICADO', id_poliza_aplica = ?
            WHERE id_transportista = ? AND estado = 'PENDIENTE'`,
          [id, t.id_transportista]
        );
      }

      // Nota: no se cambia el estado de los descuentos de aceite/administrativo aquí
      // (igual que los anticipos). El candado real contra doble conteo es que la
      // póliza se cierra (LIQUIDADA) y ya no admite una segunda confirmación.

      // Si el líquido es negativo, registra nuevo sobregiro PENDIENTE.
      if (t.liquido < 0) {
        await conn.query(
          `INSERT INTO pro_sobregiro_transportista
             (id_poliza_origen, id_transportista, valor_sobregiro, estado, usuario_graba)
           VALUES (?,?,?, 'PENDIENTE', ?)`,
          [id, t.id_transportista, Math.abs(t.liquido), user]
        );
      }

      generados += 1;
      totalLiquido += t.liquido;
    }

    // Cierra la póliza.
    await conn.query(
      'UPDATE man_poliza SET estado = ?, fecha_liquidacion = ? WHERE codigo = ?',
      ['LIQUIDADA', hoy, id]
    );

    return {
      id_poliza: id,
      transportistas_liquidados: generados,
      total_liquido: money(totalLiquido),
      mensaje: generados > 0
        ? `Liquidación confirmada: ${generados} transportista(s). La póliza quedó LIQUIDADA.`
        : 'La póliza no tenía movimientos; quedó LIQUIDADA sin registros.',
    };
  });
}

/**
 * historial — lista de liquidaciones guardadas (solo lectura) con filtros opcionales.
 * @param {object} f { id_poliza, id_transportista, num_liquidacion, fecha_ini, fecha_fin }
 */
async function historial(f = {}) {
  const cond = [];
  const params = [];
  if (f.id_poliza) { cond.push('l.id_poliza = ?'); params.push(Number(f.id_poliza)); }
  if (f.id_transportista) { cond.push('l.id_transportista = ?'); params.push(Number(f.id_transportista)); }
  if (f.num_liquidacion) { cond.push('l.num_liquidacion LIKE ?'); params.push(`%${f.num_liquidacion}%`); }
  if (f.fecha_ini) { cond.push('l.fecha_liquidacion >= ?'); params.push(f.fecha_ini); }
  if (f.fecha_fin) { cond.push('l.fecha_liquidacion <= ?'); params.push(f.fecha_fin); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  return query(
    `SELECT l.*, p.nombre_poliza, t.nit, t.nombre_comercial
       FROM pro_liquidaciones l
       LEFT JOIN man_poliza p ON p.codigo = l.id_poliza
       LEFT JOIN man_transportista t ON t.codigo = l.id_transportista
       ${where}
      ORDER BY l.correlativo DESC`,
    params
  );
}

/** detallePoliza — filas de liquidación de una póliza (para reimprimir). */
async function detallePoliza(idPoliza) {
  const id = Number(idPoliza);
  if (!id) throw errorNegocio('id_poliza inválido.', 400);
  const poliza = await queryOne('SELECT codigo, nombre_poliza, fecha_liquidacion FROM man_poliza WHERE codigo = ?', [id]);
  const filas = await query(
    `SELECT l.*, t.nit, t.nombre_comercial
       FROM pro_liquidaciones l
       LEFT JOIN man_transportista t ON t.codigo = l.id_transportista
      WHERE l.id_poliza = ?
      ORDER BY t.nombre_comercial`,
    [id]
  );
  if (!filas.length) throw errorNegocio('La póliza no tiene liquidaciones registradas.', 404);
  return { poliza, transportistas: filas };
}

/**
 * reporteDetallado — [v5 §2] arma el documento de liquidación con el formato del
 * PDF: por cada transportista con movimientos, el DETALLE de sus viajes + las
 * secciones de descuentos (anticipos, combustible, administrativos, aceite) y el
 * bloque de totales (Total a facturar, −Anticipos, Subtotal, −Suministros,
 * −Saldo negativo, Total a pagar, Total viajes).
 *
 * Los TOTALES del pie salen de pro_liquidaciones (valores ORIGINALES guardados al
 * confirmar; NO se recalculan, para no alterar históricos). El detalle sale de las
 * tablas fuente (viajes/anticipos/vales/descuentos), que son inmutables una vez la
 * póliza está cerrada. Para el combustible, el valor/galón se deriva de
 * valor_vales ÷ galones para que el detalle sume exactamente el total guardado.
 */
async function reporteDetallado(idPoliza) {
  const id = Number(idPoliza);
  if (!id) throw errorNegocio('id_poliza inválido.', 400);

  const poliza = await queryOne(
    'SELECT codigo, nombre_poliza, fecha_liquidacion, estado FROM man_poliza WHERE codigo = ?',
    [id]
  );
  if (!poliza) throw errorNegocio('La póliza no existe.', 404);

  // Totales ORIGINALES por transportista (guardados al confirmar).
  const liqs = await query(
    `SELECT l.id_transportista, l.cantidad_viajes, l.valor_viajes, l.valor_vales,
            l.valor_aceite, l.valor_administrativo, l.sobregiro_anterior,
            l.valor_anticipos, l.valor_liquidacion, l.usuario_graba,
            t.nit, t.nombre_comercial
       FROM pro_liquidaciones l
       LEFT JOIN man_transportista t ON t.codigo = l.id_transportista
      WHERE l.id_poliza = ?
      ORDER BY t.nombre_comercial`,
    [id]
  );
  if (!liqs.length) throw errorNegocio('La póliza no tiene liquidaciones registradas.', 404);

  // Detalle desde las tablas fuente (una consulta por tipo, luego se agrupa en memoria).
  const viajes = await query(
    `SELECT v.id_transportista, v.num_envio, v.fecha, v.peso, v.valor,
            c.placa, CONCAT(p.nombres, ' ', COALESCE(p.apellidos,'')) AS piloto,
            te.descripcion AS embarque, te.destino
       FROM pro_poliza_detalle v
       LEFT JOIN man_camion c ON c.codigo = v.id_camion
       LEFT JOIN man_pilotos p ON p.codigo = v.id_piloto
       LEFT JOIN cat_tarifa_embarque te ON te.codigo = v.id_tarifa_embarque
      WHERE v.id_poliza = ? AND v.estado <> 'ANULADO'
      ORDER BY v.id_transportista, v.fecha, v.correlativo`,
    [id]
  );
  const anticipos = await query(
    `SELECT id_transportista, num_anticipo, fecha, descripcion, valor
       FROM pro_anticipo_provision
      WHERE id_poliza = ? AND estado = 'ACTIVO'
      ORDER BY id_transportista, fecha`,
    [id]
  );
  const combustible = await query(
    `SELECT id_transportista, num_vale, fecha, cantidad
       FROM pro_detalle_facturas
      WHERE id_poliza = ? AND estado <> 'ANULADO'
      ORDER BY id_transportista, fecha`,
    [id]
  );
  const administrativos = await query(
    `SELECT id_transportista, fecha, descripcion, valor
       FROM pro_descuento_administrativo
      WHERE id_poliza = ? AND estado = 'ACTIVO'
      ORDER BY id_transportista, fecha`,
    [id]
  );
  const aceite = await query(
    `SELECT id_transportista, fecha, descripcion, valor
       FROM pro_descuento_aceite
      WHERE id_poliza = ? AND estado = 'ACTIVO'
      ORDER BY id_transportista, fecha`,
    [id]
  );

  // Agrupadores por transportista.
  const porTransportista = (rows) => {
    const m = new Map();
    rows.forEach((r) => {
      const k = Number(r.id_transportista);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return m;
  };
  const mViajes = porTransportista(viajes);
  const mAnt = porTransportista(anticipos);
  const mComb = porTransportista(combustible);
  const mAdmin = porTransportista(administrativos);
  const mAceite = porTransportista(aceite);
  const kgToQq = (kg) => Number((Number(kg || 0) / QQ_A_KG).toFixed(2));

  const transportistas = liqs.map((l) => {
    const k = Number(l.id_transportista);
    const totalCombustible = money(l.valor_vales);
    const totalAceite = money(l.valor_aceite);
    const totalAdministrativo = money(l.valor_administrativo);
    const totalSuministros = money(totalCombustible + totalAceite + totalAdministrativo);
    const totalAnticipos = money(l.valor_anticipos);
    const totalFacturar = money(l.valor_viajes);
    const subtotal = money(totalFacturar - totalAnticipos);
    const saldoNegativo = money(l.sobregiro_anterior);

    // Combustible: valor/galón derivado para que el detalle sume el total guardado.
    const galonesTransp = (mComb.get(k) || []).reduce((s, r) => s + Number(r.cantidad || 0), 0);
    const valorGalonDerivado = galonesTransp > 0 ? totalCombustible / galonesTransp : 0;

    return {
      id_transportista: k,
      nit: l.nit || '',
      nombre: l.nombre_comercial || '',
      viajes: (mViajes.get(k) || []).map((v) => ({
        c_porte: v.num_envio,
        fecha: v.fecha,
        piloto: (v.piloto || '').trim(),
        placa: v.placa || '',
        peso_qq: kgToQq(v.peso),
        peso_kg: money(v.peso),
        total_pago: money(v.valor),
        embarque: v.embarque || '',
        destino: v.destino || '',
      })),
      anticipos: (mAnt.get(k) || []).map((a) => ({
        num: a.num_anticipo, fecha: a.fecha, descripcion: a.descripcion || '', valor: money(a.valor),
      })),
      combustible: (mComb.get(k) || []).map((c) => ({
        num_vale: c.num_vale, fecha: c.fecha, galones: money(c.cantidad),
        valor_galon: Number(valorGalonDerivado.toFixed(4)),
        subtotal: money(Number(c.cantidad || 0) * valorGalonDerivado),
      })),
      administrativos: (mAdmin.get(k) || []).map((d) => ({
        fecha: d.fecha, descripcion: d.descripcion || '', valor: money(d.valor),
      })),
      aceite: (mAceite.get(k) || []).map((d) => ({
        fecha: d.fecha, descripcion: d.descripcion || '', valor: money(d.valor),
      })),
      totales: {
        total_facturar: totalFacturar,
        total_anticipos: totalAnticipos,
        subtotal,
        total_combustible: totalCombustible,
        total_aceite: totalAceite,
        total_administrativo: totalAdministrativo,
        total_suministros: totalSuministros,
        saldo_negativo: saldoNegativo,
        total_pagar: money(l.valor_liquidacion),
        total_viajes: Number(l.cantidad_viajes || 0),
      },
    };
  });

  return {
    poliza: {
      codigo: poliza.codigo,
      nombre_poliza: poliza.nombre_poliza,
      fecha_liquidacion: poliza.fecha_liquidacion,
      estado: poliza.estado,
    },
    usuario: liqs[0]?.usuario_graba || '',
    transportistas,
  };
}

module.exports = { resumenPoliza, confirmar, historial, detallePoliza, reporteDetallado };
