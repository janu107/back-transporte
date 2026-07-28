/**
 * dashboard.service.js — [v5 §5] Datos agregados para las 2 gráficas del dashboard.
 * Todo el agrupamiento/suma se hace en MySQL (no se traen catálogos completos
 * ni se recalcula en el frontend).
 */
const { query, queryOne } = require('../database/db');

/**
 * facturaActivaDiesel — última factura ACTIVA (saldo > 0), agrupando sus
 * despachos (pro_detalle_facturas) por transportista.
 * "Última" = mayor fecha; en empate, mayor código.
 */
async function facturaActivaDiesel() {
  const factura = await queryOne(
    `SELECT codigo, factura, fecha, unidades, precio, saldo
       FROM man_facturas_vales
      WHERE estado = 'ACTIVO' AND saldo > 0
      ORDER BY fecha DESC, codigo DESC
      LIMIT 1`
  );
  if (!factura) return { factura: null, transportistas: [], mensaje: 'No existe una factura activa de combustible para mostrar' };

  const filas = await query(
    `SELECT t.nombre_comercial AS transportista, COUNT(*) AS cantidad_vales,
            COALESCE(SUM(d.cantidad), 0) AS galones, COALESCE(SUM(d.total), 0) AS valor
       FROM pro_detalle_facturas d
       JOIN man_transportista t ON t.codigo = d.id_transportista
      WHERE d.id_factura_vale = ? AND d.estado <> 'ANULADO'
      GROUP BY t.codigo, t.nombre_comercial
      ORDER BY galones DESC`,
    [factura.codigo]
  );
  const totalUtilizado = filas.reduce((s, f) => s + Number(f.galones), 0);

  return {
    factura: {
      codigo: factura.codigo, num_factura: factura.factura, fecha: factura.fecha,
      galones_comprados: Number(factura.unidades || 0), saldo: Number(factura.saldo || 0),
      galones_utilizados: Number(totalUtilizado.toFixed(2)),
    },
    transportistas: filas.map((f) => ({
      transportista: f.transportista,
      galones: Number(Number(f.galones).toFixed(2)),
      cantidad_vales: Number(f.cantidad_vales),
      valor: Number(Number(f.valor).toFixed(2)),
    })),
  };
}

/**
 * polizaActivaViajes — última póliza ABIERTA, agrupando sus viajes
 * (pro_poliza_detalle) por transportista.
 * "Última" = mayor fecha; en empate, mayor código.
 */
async function polizaActivaViajes() {
  const poliza = await queryOne(
    `SELECT codigo, nombre_poliza, fecha
       FROM man_poliza
      WHERE estado = 'ABIERTA'
      ORDER BY fecha DESC, codigo DESC
      LIMIT 1`
  );
  if (!poliza) return { poliza: null, transportistas: [], mensaje: 'No existe una póliza activa para mostrar' };

  const filas = await query(
    `SELECT t.nombre_comercial AS transportista, COUNT(*) AS cantidad_viajes,
            COALESCE(SUM(v.peso), 0) AS peso_total, COALESCE(SUM(v.valor), 0) AS valor_total
       FROM pro_poliza_detalle v
       JOIN man_transportista t ON t.codigo = v.id_transportista
      WHERE v.id_poliza = ? AND v.estado = 'ACTIVO'
      GROUP BY t.codigo, t.nombre_comercial
      ORDER BY cantidad_viajes DESC`,
    [poliza.codigo]
  );
  const totalViajes = filas.reduce((s, f) => s + Number(f.cantidad_viajes), 0);

  return {
    poliza: { codigo: poliza.codigo, nombre_poliza: poliza.nombre_poliza, fecha: poliza.fecha, total_viajes: totalViajes },
    transportistas: filas.map((f) => ({
      transportista: f.transportista,
      cantidad_viajes: Number(f.cantidad_viajes),
      peso_total: Number(Number(f.peso_total).toFixed(2)),
      valor_total: Number(Number(f.valor_total).toFixed(2)),
    })),
  };
}

module.exports = { facturaActivaDiesel, polizaActivaViajes };
