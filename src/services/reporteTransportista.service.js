/**
 * reporteTransportista.service.js — Dos reportes sobre pólizas ACTIVAS:
 *
 * 1) porTransportista(): un transportista, una fila por póliza, con viajes,
 *    peso en quintales, flete, anticipos, diesel, aceite y el saldo a pagar.
 *
 * 2) resumenPolizasTransportistas(): matriz de transportistas (filas) contra
 *    pólizas activas (columnas) con el valor de los viajes activos de cada
 *    cruce, más totales por fila, por póliza y general.
 *
 * Decisiones:
 *   - "Póliza activa" = estado ABIERTA. Las liquidadas y anuladas quedan fuera.
 *   - Solo cuentan las transacciones vigentes (no anuladas) de cada origen.
 *   - PESO qq se deriva del peso en kg: 1 quintal = 45.359237 kg. Es la misma
 *     conversión con la que se calcula el valor del viaje
 *     (peso_kg × 0.022046 × tarifa = peso_qq × tarifa), así que el flete y el
 *     peso mostrado son consistentes entre sí.
 *   - SALDO = flete − anticipos − diesel − aceite. Puede quedar negativo cuando
 *     al transportista se le adelantó más de lo que generó en fletes.
 *   - El esquema de producción es híbrido: el transportista de cada viaje/vale se
 *     resuelve por su propia columna o por el camión, según lo que exista.
 */
const { query, queryOne } = require('../database/db');
const { existeColumna, existeTabla, sqlTransportistaDe, sqlActivo } = require('../utils/esquema');

// 1 quintal = 45.359237 kg (misma constante que el reporte de arrastre).
const QQ_A_KG = 45.359237;

// Pólizas activas: las abiertas. Sin estado grabado se asume ABIERTA, que es el
// valor por omisión de la columna.
const POLIZA_ABIERTA = "UPPER(COALESCE(p.estado, 'ABIERTA')) = 'ABIERTA'";

const money = (v) => Number(Number(v || 0).toFixed(2));
const qq = (kg) => Number((Number(kg || 0) / QQ_A_KG).toFixed(2));

function errorNegocio(mensaje, status = 400) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

/** Descuentos manuales por póliza (aceite). Cero si la tabla no existe. */
async function aceitePorPoliza(idTransportista = null) {
  const tabla = 'pro_descuento_aceite';
  if (!(await existeTabla(tabla))) return [];
  const activo = await sqlActivo(tabla, 'd');
  const filtro = idTransportista ? 'AND d.id_transportista = ?' : '';
  const params = idTransportista ? [idTransportista] : [];
  return query(
    `SELECT d.id_poliza, d.id_transportista, COALESCE(SUM(d.valor), 0) AS valor
       FROM ${tabla} d
       JOIN man_poliza p ON p.codigo = d.id_poliza
      WHERE ${POLIZA_ABIERTA} AND ${activo} ${filtro}
      GROUP BY d.id_poliza, d.id_transportista`,
    params
  ).catch(() => []);
}

/** Transportistas activos, para el selector de la pantalla. */
async function transportistas() {
  return query(
    `SELECT codigo, nit, nombre_comercial
       FROM man_transportista
      WHERE UPPER(COALESCE(estado, 'ACTIVO')) = 'ACTIVO'
      ORDER BY nombre_comercial`
  );
}

/**
 * REPORTE POR TRANSPORTISTA — resumen de sus pólizas activas.
 * @param {{id_transportista:number}} q
 */
async function porTransportista(q = {}) {
  const idT = Number(q.id_transportista);
  if (!idT) throw errorNegocio('Debe indicar el transportista.');

  const transportista = await queryOne(
    'SELECT codigo, nit, nombre_comercial FROM man_transportista WHERE codigo = ?', [idT]
  );
  if (!transportista) throw errorNegocio('El transportista no existe.', 404);

  const transpViaje = await sqlTransportistaDe('pro_poliza_detalle', 'v', 'cam');
  const activoViaje = await sqlActivo('pro_poliza_detalle', 'v');
  const viajes = await query(
    `SELECT v.id_poliza,
            COUNT(*) AS viajes,
            COALESCE(SUM(v.peso), 0)  AS peso_kg,
            COALESCE(SUM(v.valor), 0) AS flete
       FROM pro_poliza_detalle v
       LEFT JOIN man_camion cam ON cam.codigo = v.id_camion
       JOIN man_poliza p ON p.codigo = v.id_poliza
      WHERE ${POLIZA_ABIERTA} AND ${activoViaje} AND ${transpViaje} = ?
      GROUP BY v.id_poliza`,
    [idT]
  );

  // Los anticipos guardan el transportista directamente; si el esquema no tuviera
  // la columna no hay forma de atribuirlos y el reporte los muestra en cero.
  let anticipos = [];
  if (await existeColumna('pro_anticipo_provision', 'id_transportista')) {
    const activoAnt = await sqlActivo('pro_anticipo_provision', 'a');
    anticipos = await query(
      `SELECT a.id_poliza, COALESCE(SUM(a.valor), 0) AS valor
         FROM pro_anticipo_provision a
         JOIN man_poliza p ON p.codigo = a.id_poliza
        WHERE ${POLIZA_ABIERTA} AND ${activoAnt} AND a.id_transportista = ?
        GROUP BY a.id_poliza`,
      [idT]
    );
  }

  const transpVale = await sqlTransportistaDe('pro_detalle_facturas', 'd', 'cam');
  const activoVale = await sqlActivo('pro_detalle_facturas', 'd');
  const diesel = await query(
    `SELECT d.id_poliza, COALESCE(SUM(d.total), 0) AS valor
       FROM pro_detalle_facturas d
       LEFT JOIN man_camion cam ON cam.codigo = d.id_camion
       JOIN man_poliza p ON p.codigo = d.id_poliza
      WHERE ${POLIZA_ABIERTA} AND ${activoVale} AND ${transpVale} = ?
      GROUP BY d.id_poliza`,
    [idT]
  );

  const aceite = await aceitePorPoliza(idT);

  // Una fila por póliza donde el transportista tenga CUALQUIER movimiento: puede
  // tener diesel sin viajes, y esa fila también debe verse (con saldo negativo).
  const porPoliza = new Map();
  const fila = (id) => {
    if (!porPoliza.has(id)) {
      porPoliza.set(id, {
        id_poliza: id, nombre_poliza: '', viajes: 0, peso_qq: 0,
        flete: 0, anticipo: 0, diesel: 0, aceite: 0, saldo: 0,
      });
    }
    return porPoliza.get(id);
  };
  viajes.forEach((r) => {
    const f = fila(r.id_poliza);
    f.viajes = Number(r.viajes || 0);
    f.peso_qq = qq(r.peso_kg);
    f.flete = money(r.flete);
  });
  anticipos.forEach((r) => { fila(r.id_poliza).anticipo = money(r.valor); });
  diesel.forEach((r) => { fila(r.id_poliza).diesel = money(r.valor); });
  aceite.forEach((r) => { fila(r.id_poliza).aceite = money(r.valor); });

  if (porPoliza.size === 0) {
    return {
      transportista,
      filas: [],
      totales: {
        polizas: 0, viajes: 0, peso_qq: 0, flete: 0, anticipo: 0, diesel: 0, aceite: 0, saldo: 0,
      },
    };
  }

  // Nombre de cada póliza en una sola consulta.
  const ids = [...porPoliza.keys()];
  const nombres = await query(
    `SELECT codigo, nombre_poliza FROM man_poliza WHERE codigo IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  nombres.forEach((p) => { fila(p.codigo).nombre_poliza = p.nombre_poliza; });

  const filas = [...porPoliza.values()]
    .map((f) => ({ ...f, saldo: money(f.flete - f.anticipo - f.diesel - f.aceite) }))
    .sort((a, b) => String(a.nombre_poliza).localeCompare(String(b.nombre_poliza)));

  const suma = (campo) => money(filas.reduce((s, f) => s + f[campo], 0));
  return {
    transportista,
    filas,
    totales: {
      polizas: filas.length,
      viajes: filas.reduce((s, f) => s + f.viajes, 0),
      peso_qq: suma('peso_qq'),
      flete: suma('flete'),
      anticipo: suma('anticipo'),
      diesel: suma('diesel'),
      aceite: suma('aceite'),
      saldo: suma('saldo'),
    },
  };
}

/**
 * RESUMEN DE PÓLIZAS ACTIVAS POR TRANSPORTISTA — matriz transportista × póliza
 * con el valor de los viajes activos de cada cruce.
 */
async function resumenPolizasTransportistas() {
  const polizas = await query(
    `SELECT p.codigo, p.nombre_poliza
       FROM man_poliza p
      WHERE ${POLIZA_ABIERTA}
      ORDER BY p.nombre_poliza`
  );
  if (polizas.length === 0) {
    return { polizas: [], filas: [], totales_por_poliza: {}, total_general: 0 };
  }

  const transpViaje = await sqlTransportistaDe('pro_poliza_detalle', 'v', 'cam');
  const activoViaje = await sqlActivo('pro_poliza_detalle', 'v');
  const cruces = await query(
    `SELECT ${transpViaje} AS id_transportista, v.id_poliza,
            COUNT(*) AS viajes,
            COALESCE(SUM(v.valor), 0) AS valor
       FROM pro_poliza_detalle v
       LEFT JOIN man_camion cam ON cam.codigo = v.id_camion
       JOIN man_poliza p ON p.codigo = v.id_poliza
      WHERE ${POLIZA_ABIERTA} AND ${activoViaje}
      GROUP BY ${transpViaje}, v.id_poliza`
  );

  const nombresT = await query(
    'SELECT codigo, nit, nombre_comercial FROM man_transportista'
  );
  const porCodigo = new Map(nombresT.map((t) => [Number(t.codigo), t]));

  const porTransp = new Map();
  cruces.forEach((r) => {
    const id = r.id_transportista == null ? 0 : Number(r.id_transportista);
    if (!porTransp.has(id)) {
      const t = porCodigo.get(id);
      porTransp.set(id, {
        id_transportista: id || null,
        nit: t?.nit || '',
        nombre: t?.nombre_comercial || 'Sin transportista asignado',
        valores: {}, viajes: 0, total: 0,
      });
    }
    const f = porTransp.get(id);
    f.valores[r.id_poliza] = money(r.valor);
    f.viajes += Number(r.viajes || 0);
  });

  const filas = [...porTransp.values()]
    .map((f) => ({
      ...f,
      total: money(Object.values(f.valores).reduce((s, v) => s + v, 0)),
    }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

  const totalesPorPoliza = {};
  polizas.forEach((p) => {
    totalesPorPoliza[p.codigo] = money(
      filas.reduce((s, f) => s + (f.valores[p.codigo] || 0), 0)
    );
  });

  return {
    polizas,
    filas,
    totales_por_poliza: totalesPorPoliza,
    total_general: money(filas.reduce((s, f) => s + f.total, 0)),
    total_viajes: filas.reduce((s, f) => s + f.viajes, 0),
  };
}

module.exports = {
  transportistas,
  porTransportista,
  resumenPolizasTransportistas,
  QQ_A_KG,
};
