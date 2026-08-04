/**
 * reporteAnticiposPoliza.service.js — [2026-08 §11]
 * REPORTE DE ANTICIPOS A TRANSPORTISTAS (por póliza o arrastre).
 * Parámetro: modo = POLIZA (una póliza) | ARRASTRE (todas las pólizas).
 * Agrupa los anticipos (pro_anticipo_provision, no anulados) por transportista,
 * con Vale, Placa, Fecha, Piloto, Anticipo y Motivo, subtotal por transportista
 * y total por póliza / general.
 */
const { query, queryOne } = require('../database/db');

function bad(mensaje) { const e = new Error(mensaje); e.status = 400; return e; }

async function generar(q = {}) {
  const modo = String(q.modo || (q.id_poliza ? 'POLIZA' : 'ARRASTRE')).toUpperCase();

  const cond = ["a.estado <> 'ANULADO'"];
  const params = [];
  let poliza = null;

  if (modo === 'POLIZA') {
    if (!q.id_poliza) throw bad('Seleccione una póliza para el reporte por póliza.');
    cond.push('a.id_poliza = ?');
    params.push(Number(q.id_poliza));
    poliza = await queryOne('SELECT codigo, nombre_poliza FROM man_poliza WHERE codigo = ?', [Number(q.id_poliza)]);
    if (!poliza) throw bad('La póliza no existe.');
  }

  const rows = await query(
    `SELECT a.num_anticipo, a.fecha, a.valor, a.descripcion,
            t.codigo AS id_transportista, t.nombre_comercial AS transportista,
            c.placa,
            TRIM(CONCAT(pi.nombres, ' ', COALESCE(pi.apellidos, ''))) AS piloto,
            p.nombre_poliza
       FROM pro_anticipo_provision a
       LEFT JOIN man_transportista t ON t.codigo = a.id_transportista
       LEFT JOIN man_camion c        ON c.codigo = a.id_camion
       LEFT JOIN man_pilotos pi      ON pi.codigo = a.id_piloto
       LEFT JOIN man_poliza p        ON p.codigo = a.id_poliza
      WHERE ${cond.join(' AND ')}
      ORDER BY t.nombre_comercial, a.fecha, a.num_anticipo`,
    params
  );

  // Agrupa por transportista con subtotal.
  const map = new Map();
  rows.forEach((r) => {
    const k = r.id_transportista == null ? 0 : Number(r.id_transportista);
    if (!map.has(k)) {
      map.set(k, { id_transportista: k, transportista: r.transportista || 'SIN TRANSPORTISTA', anticipos: [], total: 0 });
    }
    const g = map.get(k);
    g.anticipos.push({
      num_anticipo: r.num_anticipo,
      placa: r.placa || '',
      fecha: r.fecha,
      piloto: r.piloto || '',
      valor: Number(r.valor || 0),
      motivo: r.descripcion || '',
      poliza: r.nombre_poliza || '',
    });
    g.total = Number((g.total + Number(r.valor || 0)).toFixed(2));
  });

  const grupos = [...map.values()];
  const total_general = Number(grupos.reduce((s, g) => s + g.total, 0).toFixed(2));

  return {
    modo,
    poliza: poliza ? { codigo: poliza.codigo, nombre_poliza: poliza.nombre_poliza } : null,
    grupos,
    total_general,
  };
}

module.exports = { generar };
