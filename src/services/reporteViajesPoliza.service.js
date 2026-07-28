/**
 * reporteViajesPoliza.service.js — [v5 §7] REPORTE DE VIAJES POR PÓLIZA.
 *
 * Filtros: póliza (obligatoria), transportista (opcional: por id o NIT).
 * Sin transportista => todos los relacionados con la póliza, agrupados con
 * subtotales. "Destino" sale de cat_tarifa_embarque.destino (vía
 * pro_poliza_detalle.id_tarifa_embarque), igual que en la Carta de Porte.
 * "Peso en quintales" se deriva de peso(kg) ÷ 45.359237 (ver reporteArrastre).
 * Filtro "estado <> 'ANULADO'" (no "= 'ACTIVO'"): mismo criterio que
 * viajes.service.js:resumenPoliza() para contar viajes reales (el ENUM también
 * admite LIQUIDADO).
 */
const { query, queryOne } = require('../database/db');
const { QQ_A_KG } = require('./reporteArrastre.service');

function bad(mensaje, status = 400) { const e = new Error(mensaje); e.status = status; return e; }
const kgToQq = (kg) => Number((Number(kg || 0) / QQ_A_KG).toFixed(2));

async function generar(q = {}) {
  const idPoliza = Number(q.poliza_id);
  if (!idPoliza) throw bad('Debe indicar la póliza.');

  const poliza = await queryOne(
    'SELECT codigo, nombre_poliza, fecha, fecha_liquidacion, estado FROM man_poliza WHERE codigo = ?',
    [idPoliza]
  );
  if (!poliza) throw bad('La póliza no existe.', 404);

  // Resuelve transportista por id o por NIT (opcional). Si no se indica ninguno, es "Todos".
  let idTransportista = q.transportista_id ? Number(q.transportista_id) : null;
  if (!idTransportista && q.nit) {
    const t = await queryOne('SELECT codigo FROM man_transportista WHERE nit = ?', [q.nit]);
    if (!t) throw bad('No existe un transportista con ese NIT.', 404);
    idTransportista = t.codigo;
  }
  if (idTransportista) {
    // Debe estar relacionado con la póliza (tener al menos un viaje ahí).
    const rel = await queryOne(
      'SELECT 1 FROM pro_poliza_detalle WHERE id_poliza = ? AND id_transportista = ? LIMIT 1',
      [idPoliza, idTransportista]
    );
    if (!rel) throw bad('El transportista indicado no tiene viajes en esta póliza.', 400);
  }

  const cond = ['v.id_poliza = ?', "v.estado <> 'ANULADO'"];
  const params = [idPoliza];
  if (idTransportista) { cond.push('v.id_transportista = ?'); params.push(idTransportista); }

  const filas = await query(
    `SELECT v.correlativo, v.num_envio, v.fecha, v.peso, v.valor,
            v.id_transportista, t.nombre_comercial AS transportista,
            c.placa, CONCAT(p.nombres, ' ', COALESCE(p.apellidos,'')) AS piloto,
            te.destino
       FROM pro_poliza_detalle v
       JOIN man_transportista t ON t.codigo = v.id_transportista
       LEFT JOIN man_camion c ON c.codigo = v.id_camion
       LEFT JOIN man_pilotos p ON p.codigo = v.id_piloto
       LEFT JOIN cat_tarifa_embarque te ON te.codigo = v.id_tarifa_embarque
      WHERE ${cond.join(' AND ')}
      ORDER BY t.nombre_comercial, v.fecha, v.correlativo`,
    params
  );

  // Agrupa por transportista (con o sin filtro, siempre se agrupa; si hay
  // filtro por transportista solo habrá un grupo).
  const gruposMap = new Map();
  filas.forEach((f) => {
    if (!gruposMap.has(f.id_transportista)) {
      gruposMap.set(f.id_transportista, {
        id_transportista: f.id_transportista, transportista: f.transportista,
        filas: [], subtotal_viajes: 0, subtotal_peso_kg: 0, subtotal_pagado: 0,
      });
    }
    const g = gruposMap.get(f.id_transportista);
    const peso = Number(f.peso || 0);
    const valor = Number(f.valor || 0);
    g.filas.push({
      correlativo: f.correlativo, num_envio: f.num_envio, fecha: f.fecha,
      piloto: (f.piloto || '').trim(), placa: f.placa,
      peso_qq: kgToQq(peso), peso_kg: peso, valor, destino: f.destino || '',
    });
    g.subtotal_viajes += 1;
    g.subtotal_peso_kg += peso;
    g.subtotal_pagado += valor;
  });
  const grupos = [...gruposMap.values()].map((g) => ({
    ...g,
    subtotal_peso_kg: Number(g.subtotal_peso_kg.toFixed(2)),
    subtotal_peso_qq: kgToQq(g.subtotal_peso_kg),
    subtotal_pagado: Number(g.subtotal_pagado.toFixed(2)),
  }));

  const totales = grupos.reduce((acc, g) => ({
    total_viajes: acc.total_viajes + g.subtotal_viajes,
    total_peso_kg: acc.total_peso_kg + g.subtotal_peso_kg,
    total_pagado: acc.total_pagado + g.subtotal_pagado,
  }), { total_viajes: 0, total_peso_kg: 0, total_pagado: 0 });

  return {
    poliza: {
      codigo: poliza.codigo, nombre_poliza: poliza.nombre_poliza,
      fecha: poliza.fecha, fecha_liquidacion: poliza.fecha_liquidacion, estado: poliza.estado,
    },
    transportista_filtro: idTransportista,
    grupos,
    totales: {
      total_viajes: totales.total_viajes,
      total_peso_kg: Number(totales.total_peso_kg.toFixed(2)),
      total_peso_qq: kgToQq(totales.total_peso_kg),
      total_pagado: Number(totales.total_pagado.toFixed(2)),
    },
  };
}

module.exports = { generar };
