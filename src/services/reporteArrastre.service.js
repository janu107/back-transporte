/**
 * reporteArrastre.service.js — [v5 §6] ARRASTRE DE PESOS/BULTOS POR PÓLIZAS
 * Y PUNTOS DE EMBARQUE.
 *
 * Decisiones documentadas (el esquema real no modela "punto de embarque" como
 * catálogo propio ni "quintales" por viaje; se adaptan así, sin inventar datos):
 *   - "Punto de embarque" = cat_tarifa_embarque (código + origen + destino),
 *     vinculado a cada viaje vía pro_poliza_detalle.id_tarifa_embarque.
 *   - "Peso en quintales" por viaje se deriva de peso (kg) ÷ 45.359237
 *     (1 quintal = 45.359237 kg; conversión estándar, no una regla de negocio
 *     inventada — la póliza ya maneja peso_quintales y peso_kilogramos).
 *   - "Arrastre"/saldo = acumulado de TODOS los viajes NO ANULADOS con
 *     fecha ≤ fecha_fin (no solo los del rango) — es el saldo real de la
 *     póliza a esa fecha. El DETALLE listado sí se acota a [fecha_inicio,
 *     fecha_fin] para no mostrar miles de filas históricas.
 *   - Filtro "estado <> 'ANULADO'" (no "= 'ACTIVO'"): pro_poliza_detalle.estado
 *     admite ACTIVO/ANULADO/LIQUIDADO (ver viajes.service.js), y el criterio
 *     "no anulado" es el mismo que usa resumenPoliza() para contar viajes reales.
 */
const { query, queryOne } = require('../database/db');

const QQ_A_KG = 45.359237;

function bad(mensaje, status = 400) { const e = new Error(mensaje); e.status = status; return e; }

async function generar(q = {}) {
  const idPoliza = Number(q.poliza_id);
  if (!idPoliza) throw bad('Debe indicar la póliza.');
  if (!q.fecha_inicio || !q.fecha_fin) throw bad('Las fechas inicial y final son obligatorias.');
  if (q.fecha_inicio > q.fecha_fin) throw bad('La fecha inicial no puede ser mayor que la fecha final.');
  const idPunto = q.punto_embarque_id ? Number(q.punto_embarque_id) : null;

  const poliza = await queryOne(
    'SELECT codigo, nombre_poliza, estado, cantidad_bultos, cantidad_piezas, peso_kilogramos FROM man_poliza WHERE codigo = ?',
    [idPoliza]
  );
  if (!poliza) throw bad('La póliza no existe.', 404);

  let puntoEmbarque = null;
  if (idPunto) {
    puntoEmbarque = await queryOne('SELECT codigo, descripcion, origen, destino FROM cat_tarifa_embarque WHERE codigo = ?', [idPunto]);
    if (!puntoEmbarque) throw bad('El punto de embarque no existe.', 404);
  }

  // --- Arrastre (acumulado real de la póliza hasta fecha_fin, sin límite inferior) ---
  // Nota: "no ANULADO" (no "= ACTIVO") para incluir también LIQUIDADO, igual que
  // viajes.service.js:resumenPoliza() — hoy ningún viaje llega a LIQUIDADO desde
  // el frontend, pero el reporte no debe quedar ciego si eso cambia.
  const arrCond = ['id_poliza = ?', "estado <> 'ANULADO'", 'fecha <= ?'];
  const arrParams = [idPoliza, q.fecha_fin];
  if (idPunto) { arrCond.push('id_tarifa_embarque = ?'); arrParams.push(idPunto); }
  const arrastre = await queryOne(
    `SELECT COALESCE(SUM(cantidad_bultos_piezas),0) AS piezas, COALESCE(SUM(peso),0) AS peso_kg
       FROM pro_poliza_detalle WHERE ${arrCond.join(' AND ')}`,
    arrParams
  );
  const piezasArrastradas = Number(arrastre.piezas || 0);
  const pesoArrastradoKg = Number(arrastre.peso_kg || 0);

  // --- Saldo corriente: punto de partida = total de la póliza menos lo consumido
  // por viajes ANTERIORES al rango, para que el saldo de la primera fila del rango
  // continúe desde donde iba. ---
  const preCond = ['id_poliza = ?', "estado <> 'ANULADO'", 'fecha < ?'];
  const preParams = [idPoliza, q.fecha_inicio];
  if (idPunto) { preCond.push('id_tarifa_embarque = ?'); preParams.push(idPunto); }
  const previo = await queryOne(
    `SELECT COALESCE(SUM(cantidad_bultos_piezas),0) AS piezas, COALESCE(SUM(peso),0) AS peso_kg
       FROM pro_poliza_detalle WHERE ${preCond.join(' AND ')}`,
    preParams
  );
  let saldoPiezasCorr = Number(poliza.cantidad_piezas || 0) - Number(previo.piezas || 0);
  let saldoPesoCorr = Number(poliza.peso_kilogramos || 0) - Number(previo.peso_kg || 0);

  // --- Detalle (acotado al rango de fechas consultado). Se ordena cronológicamente
  // (fecha, correlativo) para calcular el saldo corriente fila a fila. ---
  const detCond = ['v.id_poliza = ?', "v.estado <> 'ANULADO'", 'v.fecha BETWEEN ? AND ?'];
  const detParams = [idPoliza, q.fecha_inicio, q.fecha_fin];
  if (idPunto) { detCond.push('v.id_tarifa_embarque = ?'); detParams.push(idPunto); }
  const filas = await query(
    `SELECT v.correlativo, v.num_envio, v.fecha, v.cantidad_bultos_piezas, v.peso,
            v.id_tarifa_embarque, te.descripcion AS punto_desc, te.origen, te.destino,
            c.placa, CONCAT(p.nombres, ' ', COALESCE(p.apellidos,'')) AS piloto
       FROM pro_poliza_detalle v
       LEFT JOIN cat_tarifa_embarque te ON te.codigo = v.id_tarifa_embarque
       LEFT JOIN man_camion c ON c.codigo = v.id_camion
       LEFT JOIN man_pilotos p ON p.codigo = v.id_piloto
      WHERE ${detCond.join(' AND ')}
      ORDER BY v.fecha, v.correlativo`,
    detParams
  );

  // Agrupa por punto de embarque, con totales por grupo y saldo corriente por fila.
  const gruposMap = new Map();
  filas.forEach((f) => {
    const key = f.id_tarifa_embarque || 0;
    if (!gruposMap.has(key)) {
      gruposMap.set(key, {
        id_tarifa_embarque: f.id_tarifa_embarque,
        descripcion: f.id_tarifa_embarque ? `${f.punto_desc || ''} (${f.origen || '—'} → ${f.destino || '—'})` : 'Sin punto de embarque asignado',
        filas: [], total_piezas: 0, total_peso_kg: 0,
      });
    }
    const g = gruposMap.get(key);
    const pesoKg = Number(f.peso || 0);
    const piezas = Number(f.cantidad_bultos_piezas || 0);
    // El saldo corriente decrece con cada carta de porte (orden cronológico).
    saldoPiezasCorr -= piezas;
    saldoPesoCorr -= pesoKg;
    g.filas.push({
      correlativo: f.correlativo, num_envio: f.num_envio, fecha: f.fecha,
      piloto: (f.piloto || '').trim(), placa: f.placa,
      piezas,
      peso_qq: Number((pesoKg / QQ_A_KG).toFixed(2)),
      peso_kg: pesoKg,
      saldo_bultos: saldoPiezasCorr,
      saldo_kg: Number(saldoPesoCorr.toFixed(2)),
    });
    g.total_piezas += piezas;
    g.total_peso_kg += pesoKg;
  });
  const grupos = [...gruposMap.values()].map((g) => ({
    ...g, total_peso_kg: Number(g.total_peso_kg.toFixed(2)), total_peso_qq: Number((g.total_peso_kg / QQ_A_KG).toFixed(2)),
  }));

  const totalPiezasDetalle = grupos.reduce((s, g) => s + g.total_piezas, 0);
  const totalPesoKgDetalle = grupos.reduce((s, g) => s + g.total_peso_kg, 0);

  return {
    poliza: { codigo: poliza.codigo, nombre_poliza: poliza.nombre_poliza, estado: poliza.estado },
    punto_embarque: puntoEmbarque,
    resumen: {
      cantidad_piezas_poliza: Number(poliza.cantidad_piezas || 0),
      peso_kilogramos_poliza: Number(poliza.peso_kilogramos || 0),
      piezas_arrastradas: piezasArrastradas,
      peso_arrastrado_kg: Number(pesoArrastradoKg.toFixed(2)),
      peso_arrastrado_qq: Number((pesoArrastradoKg / QQ_A_KG).toFixed(2)),
      saldo_piezas: Number(poliza.cantidad_piezas || 0) - piezasArrastradas,
      saldo_peso_kg: Number((Number(poliza.peso_kilogramos || 0) - pesoArrastradoKg).toFixed(2)),
    },
    grupos,
    totales: {
      total_piezas: totalPiezasDetalle,
      total_peso_kg: Number(totalPesoKgDetalle.toFixed(2)),
      total_peso_qq: Number((totalPesoKgDetalle / QQ_A_KG).toFixed(2)),
    },
  };
}

module.exports = { generar, QQ_A_KG };
