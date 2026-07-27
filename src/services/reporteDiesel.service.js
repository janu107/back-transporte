/**
 * reporteDiesel.service.js — REPORTE DE DIESEL POR FACTURA (P18).
 * Agrupa los vales de combustible (pro_detalle_facturas) por factura de compra.
 * Implementado en JS (sin SP), con consultas parametrizadas. Devuelve
 * { facturas, detalle, totales } tal como consume la pantalla.
 */
const { query } = require('../database/db');

function bad(mensaje) { const e = new Error(mensaje); e.status = 400; return e; }

/**
 * @param {object} q { tipo, valor, estado_poliza, fecha_ini, fecha_fin }
 *   tipo: TODO | POLIZA | TRANSPORTISTA
 *   estado_poliza: AMBAS | ACTIVA | LIQUIDADA
 */
async function generar(q = {}) {
  const tipo = String(q.tipo || 'TODO').toUpperCase();
  const estado = String(q.estado_poliza || 'AMBAS').toUpperCase();
  const fIni = q.fecha_ini;
  const fFin = q.fecha_fin;

  if (!fIni || !fFin) throw bad('Las fechas inicial y final son obligatorias.');
  if (fIni > fFin) throw bad('La fecha inicial no puede ser posterior a la final.');
  if ((tipo === 'POLIZA' || tipo === 'TRANSPORTISTA') && !q.valor) {
    throw bad(`Debe indicar el valor del filtro para tipo ${tipo}.`);
  }

  const cond = ['d.fecha BETWEEN ? AND ?', "d.estado <> 'ANULADO'"];
  const params = [fIni, fFin];

  if (estado === 'ACTIVA') cond.push("po.estado = 'ABIERTA'");
  else if (estado === 'LIQUIDADA') cond.push("po.estado = 'LIQUIDADA'");

  if (tipo === 'POLIZA') { cond.push('(po.nombre_poliza = ? OR po.codigo = ?)'); params.push(q.valor, q.valor); }
  else if (tipo === 'TRANSPORTISTA') { cond.push('(t.codigo = ? OR t.nombre_comercial = ?)'); params.push(q.valor, q.valor); }

  const rows = await query(
    `SELECT d.correlativo AS id_detalle, d.id_factura_vale AS id_factura, d.num_vale,
            d.fecha AS fecha_vale, d.cantidad AS galones, d.total AS valor,
            f.factura AS num_factura, f.unidades AS galones_comprados, f.precio AS precio_galon,
            f.saldo, f.estado AS estado_factura, f.fecha AS fecha_factura,
            pr.descripcion AS producto,
            po.nombre_poliza AS poliza, po.estado AS estado_poliza,
            t.nombre_comercial AS transportista, c.placa AS placa
       FROM pro_detalle_facturas d
       JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
       LEFT JOIN cat_productos pr ON pr.codigo = f.id_producto
       LEFT JOIN man_poliza po ON po.codigo = d.id_poliza
       LEFT JOIN man_transportista t ON t.codigo = d.id_transportista
       LEFT JOIN man_camion c ON c.codigo = d.id_camion
      WHERE ${cond.join(' AND ')}
      ORDER BY f.factura, d.fecha, d.correlativo`,
    params
  );

  // Estado de póliza a etiqueta del reporte (ABIERTA -> ACTIVA).
  const estadoPolLabel = (e) => (String(e).toUpperCase() === 'ABIERTA' ? 'ACTIVA' : String(e || '').toUpperCase());

  const facturasMap = new Map();
  const detalle = rows.map((r) => {
    if (!facturasMap.has(r.id_factura)) {
      facturasMap.set(r.id_factura, {
        id_factura: r.id_factura, num_factura: r.num_factura, producto: r.producto,
        fecha_factura: r.fecha_factura, galones_comprados: Number(r.galones_comprados || 0),
        precio_galon: Number(r.precio_galon || 0), saldo: Number(r.saldo || 0),
        estado_factura: r.estado_factura, galones_despachados: 0, total_valor: 0,
      });
    }
    const h = facturasMap.get(r.id_factura);
    h.galones_despachados += Number(r.galones || 0);
    h.total_valor += Number(r.valor || 0);
    return {
      id_factura: r.id_factura, id_detalle: r.id_detalle, fecha_vale: r.fecha_vale,
      num_vale: r.num_vale, transportista: r.transportista, placa: r.placa,
      poliza: r.poliza, estado_poliza: estadoPolLabel(r.estado_poliza),
      galones: Number(r.galones || 0), valor: Number(r.valor || 0),
    };
  });

  const facturas = [...facturasMap.values()].map((h) => ({
    ...h,
    galones_despachados: Number(h.galones_despachados.toFixed(2)),
    total_valor: Number(h.total_valor.toFixed(2)),
  }));

  const totales = {
    total_facturas: facturas.length,
    total_galones: Number(detalle.reduce((s, d) => s + d.galones, 0).toFixed(2)),
    total_valor_general: Number(detalle.reduce((s, d) => s + d.valor, 0).toFixed(2)),
  };

  return { facturas, detalle, totales };
}

module.exports = { generar };
