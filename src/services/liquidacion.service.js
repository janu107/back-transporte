/**
 * liquidacion.service.js — LIQUIDACIÓN DE PÓLIZAS.
 *
 * resumenPoliza(idPoliza): calcula (sin guardar) el líquido por transportista.
 * confirmar(idPoliza, usuario): guarda liquidaciones, aplica/genera sobregiros y
 *   cierra la póliza, todo dentro de una transacción idempotente.
 *
 * Fórmulas:
 *   valor_combustible = SUM(pro_detalle_facturas.cantidad) × valor_galon_combustible
 *   total_descuentos  = valor_combustible + valor_anticipos + sobregiro_anterior
 *   liquido           = valor_viajes − total_descuentos
 *
 * Para evitar multiplicar filas (relaciones 1→N con viajes, anticipos y combustible)
 * NO se hace un JOIN plano: se agrupa cada fuente por transportista por separado y
 * se combinan en memoria.
 */
const { query, queryOne, withTransaction } = require('../database/db');
const { siguienteCorrelativo } = require('../utils/correlativo');

const ESTADO_VIAJE_ACTIVO = 'ACTIVO';
const ESTADO_ANTICIPO_ACTIVO = 'ACTIVO';

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
      WHERE id_poliza = ?
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
        sobregiro_anterior: 0,
      });
    }
    return map.get(k);
  };

  viajes.forEach((r) => { const t = ensure(r.id_transportista); t.cantidad_viajes = Number(r.cnt); t.valor_viajes = money(r.val); });
  anticipos.forEach((r) => { const t = ensure(r.id_transportista); t.cantidad_anticipos = Number(r.cnt); t.valor_anticipos = money(r.val); });
  combustible.forEach((r) => { const t = ensure(r.id_transportista); t.cantidad_vale = Number(r.cnt); t.total_galones = money(r.galones); t.valor_combustible = money(Number(r.galones) * galon); });
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
    const total_descuentos = money(t.valor_combustible + t.valor_anticipos + t.sobregiro_anterior);
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
            cantidad_vale, valor_vales, cantidad_anticipos, valor_anticipos,
            valor_liquidacion, estado, fecha_liquidacion, usuario_graba)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [numLiq, id, t.id_transportista, t.cantidad_viajes, t.valor_viajes,
          t.cantidad_vale, t.valor_combustible, t.cantidad_anticipos, t.valor_anticipos,
          t.liquido, 'LIQUIDADA', hoy, user]
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

module.exports = { resumenPoliza, confirmar };
