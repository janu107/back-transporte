/**
 * reportePolizasPendientes.service.js — [2026-08 §10]
 * REPORTE DE PÓLIZAS PENDIENTES DE LIQUIDAR.
 * Parámetro: estados (activos / liquidados / anulados; uno o varios).
 * Devuelve, por póliza: nombre, fecha, peso (kgrs), bultos y piezas + totales.
 */
const { query } = require('../database/db');

// Mapea la etiqueta del filtro al estado real de man_poliza.
const ESTADO_MAP = {
  ACTIVOS: 'ABIERTA', ACTIVAS: 'ABIERTA', ACTIVO: 'ABIERTA', ABIERTA: 'ABIERTA',
  LIQUIDADOS: 'LIQUIDADA', LIQUIDADAS: 'LIQUIDADA', LIQUIDADA: 'LIQUIDADA',
  ANULADOS: 'ANULADA', ANULADAS: 'ANULADA', ANULADA: 'ANULADA',
};

async function generar(q = {}) {
  // `estados` puede venir como CSV ("ABIERTA,LIQUIDADA") o como arreglo.
  let estados = q.estados;
  if (typeof estados === 'string') estados = estados.split(',');
  if (!Array.isArray(estados)) estados = [];
  const reales = [...new Set(
    estados.map((e) => ESTADO_MAP[String(e).trim().toUpperCase()]).filter(Boolean)
  )];
  // Por defecto: pendientes por liquidar = ABIERTA.
  const lista = reales.length ? reales : ['ABIERTA'];

  const placeholders = lista.map(() => '?').join(',');
  const polizas = await query(
    `SELECT codigo, nombre_poliza, fecha, estado,
            COALESCE(peso_total, 0)      AS peso_total,
            COALESCE(cantidad_bultos, 0) AS cantidad_bultos,
            COALESCE(cantidad_piezas, 0) AS cantidad_piezas
       FROM man_poliza
      WHERE estado IN (${placeholders})
      ORDER BY fecha DESC, codigo DESC`,
    lista
  );

  const totales = {
    total_polizas: polizas.length,
    total_peso: Number(polizas.reduce((s, r) => s + Number(r.peso_total || 0), 0).toFixed(2)),
    total_bultos: polizas.reduce((s, r) => s + Number(r.cantidad_bultos || 0), 0),
    total_piezas: polizas.reduce((s, r) => s + Number(r.cantidad_piezas || 0), 0),
  };

  return { estados: lista, polizas, totales };
}

module.exports = { generar };
