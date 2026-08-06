/**
 * viajes.service.js
 * Lógica del REGISTRO DE VIAJES (Detalle de Póliza / Envíos) sobre pro_poliza_detalle.
 *
 * Reglas de negocio (validadas SIEMPRE en servidor):
 *   - La póliza debe estar ABIERTA.
 *   - El piloto (si se indica) debe pertenecer al transportista del camión.
 *   - Las piezas del viaje no pueden exceder el SALDO de piezas de la póliza
 *     (piezas de la póliza − piezas ya usadas por viajes NO anulados).
 *   - VALOR = peso (kg) × COEFICIENTE  (se recalcula en servidor, no se confía en el cliente).
 *
 * Agregados que consume la pantalla:
 *   - saldo_piezas y viajes_realizados por póliza.
 */
const { query, queryOne, execute, withTransaction } = require('../database/db');
const { siguienteCorrelativo } = require('../utils/correlativo');
const { obtenerPorcentajePagos } = require('./configuracion.service');

// Factor kg->lb de la fórmula del valor: VALOR = ROUND(peso_kg × factor × tarifa, 2).
// [2026-08 §8] El factor ahora proviene del parámetro "Porcentaje de pagos"
// (con_parametros); esta constante queda como respaldo por defecto.
const FACTOR_KG_LB = 0.022046;

// El ENUM real de pro_poliza_detalle.estado en el servidor.
const ESTADOS_VIAJE = ['ACTIVO', 'ANULADO', 'LIQUIDADO'];
const ESTADO_ANULADA = 'ANULADO';

/** Normaliza el estado a un valor válido del ENUM (default ACTIVO). */
function normalizarEstadoViaje(v) {
  let e = String(v || '').toUpperCase();
  if (e === 'ANULADA') e = 'ANULADO';       // corrige femenino -> ENUM
  if (e === 'PENDIENTE' || e === '') e = 'ACTIVO';
  return ESTADOS_VIAJE.includes(e) ? e : 'ACTIVO';
}

/** Calcula el valor del viaje: peso(kg) × factor × valor_tarifa, redondeado a 2.
 *  `factor` = "Porcentaje de pagos" del parámetro (default 0.022046). */
function calcularValor(pesoKg, valorTarifa, factor = FACTOR_KG_LB) {
  const f = Number(factor);
  return Number((Number(pesoKg || 0) * (Number.isFinite(f) && f > 0 ? f : FACTOR_KG_LB) * Number(valorTarifa || 0)).toFixed(2));
}

/** Normaliza '' | undefined -> null. */
const nz = (v) => (v === '' || v === undefined ? null : v);

/** Valida entero/numérico obligatorio; lanza Error 400 si no. */
function requerirNumero(valor, campo) {
  const n = Number(valor);
  if (valor === undefined || valor === null || valor === '' || Number.isNaN(n)) {
    const e = new Error(`El campo "${campo}" es obligatorio y debe ser numérico.`);
    e.status = 400;
    throw e;
  }
  return n;
}

function errorNegocio(mensaje, status = 409) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

/** Lista los viajes (detalle de póliza), más recientes primero. */
async function listar() {
  return query('SELECT * FROM `pro_poliza_detalle` ORDER BY `correlativo` DESC');
}

/**
 * resumenPoliza
 * Devuelve los datos y totales de una póliza para la pantalla:
 *   cantidad_piezas, piezas_usadas, saldo_piezas, viajes_realizados y pesos.
 * @param {number} idPoliza
 */
async function resumenPoliza(idPoliza) {
  const id = requerirNumero(idPoliza, 'id_poliza');

  const poliza = await queryOne(
    `SELECT codigo, nombre_poliza, estado, cantidad_bultos, cantidad_piezas,
            peso_quintales, peso_kilogramos, peso_total
       FROM man_poliza WHERE codigo = ?`,
    [id]
  );
  if (!poliza) throw errorNegocio('La póliza no existe.', 404);

  const agg = await queryOne(
    `SELECT COALESCE(SUM(cantidad_bultos_piezas), 0) AS piezas_usadas,
            COUNT(*) AS viajes_realizados
       FROM pro_poliza_detalle
      WHERE id_poliza = ? AND estado <> ?`,
    [id, ESTADO_ANULADA]
  );

  const cantidadPiezas = Number(poliza.cantidad_piezas || 0);
  const piezasUsadas = Number(agg.piezas_usadas || 0);
  const viajes = Number(agg.viajes_realizados || 0);

  return {
    id_poliza: id,
    nombre_poliza: poliza.nombre_poliza,
    estado: poliza.estado,
    cantidad_piezas: cantidadPiezas,
    peso_quintales: Number(poliza.peso_quintales || 0),
    peso_kilogramos: Number(poliza.peso_kilogramos || 0),
    peso_total: Number(poliza.peso_total || 0),
    piezas_usadas: piezasUsadas,
    saldo_piezas: cantidadPiezas - piezasUsadas,
    viajes_realizados: viajes,
  };
}

/**
 * Valida las reglas de negocio y devuelve el registro normalizado listo para
 * insertar/actualizar. `excluirCorrelativo` evita contar el propio viaje al
 * recalcular el saldo en una edición.
 */
async function validarYNormalizar(data, excluirCorrelativo = null) {
  const idPoliza = requerirNumero(data.id_poliza, 'id_poliza');

  // 1) Póliza debe existir y estar ABIERTA.
  const poliza = await queryOne(
    'SELECT codigo, estado, cantidad_piezas FROM man_poliza WHERE codigo = ?',
    [idPoliza]
  );
  if (!poliza) throw errorNegocio('La póliza no existe.', 400);
  if (String(poliza.estado).toUpperCase() !== 'ABIERTA') {
    throw errorNegocio(`La póliza no está ABIERTA (estado actual: ${poliza.estado}).`);
  }

  // 2) Camión y transportista coherentes (si se indica camión).
  let idCamion = nz(data.id_camion);
  let idTransportista = nz(data.id_transportista);
  if (idCamion != null) {
    const camion = await queryOne('SELECT codigo, id_transportista FROM man_camion WHERE codigo = ?', [idCamion]);
    if (!camion) throw errorNegocio('El camión (placa) no existe.', 400);
    // El transportista se toma del camión (fuente de verdad).
    idTransportista = camion.id_transportista;
  }

  // 3) Piloto (si se indica) debe pertenecer al transportista.
  const idPiloto = nz(data.id_piloto);
  if (idPiloto != null) {
    const piloto = await queryOne('SELECT codigo, id_transportista FROM man_pilotos WHERE codigo = ?', [idPiloto]);
    if (!piloto) throw errorNegocio('El piloto no existe.', 400);
    if (idTransportista != null && Number(piloto.id_transportista) !== Number(idTransportista)) {
      throw errorNegocio('El piloto seleccionado no pertenece al transportista del camión.');
    }
  }

  // 4) Saldo de piezas.
  const piezas = Number(data.cantidad_bultos_piezas || 0);
  if (piezas < 0) throw errorNegocio('La cantidad de piezas no puede ser negativa.', 400);

  const aggParams = [idPoliza, ESTADO_ANULADA];
  let excluir = '';
  if (excluirCorrelativo != null) {
    excluir = ' AND correlativo <> ?';
    aggParams.push(excluirCorrelativo);
  }
  const agg = await queryOne(
    `SELECT COALESCE(SUM(cantidad_bultos_piezas), 0) AS usadas
       FROM pro_poliza_detalle
      WHERE id_poliza = ? AND estado <> ?${excluir}`,
    aggParams
  );
  const saldo = Number(poliza.cantidad_piezas || 0) - Number(agg.usadas || 0);
  if (piezas > saldo) {
    throw errorNegocio(`Las piezas del viaje (${piezas}) exceden el saldo disponible de la póliza (${saldo}).`);
  }

  // 5) Valor = peso(kg) × 0.022046 × valor_tarifa (recalculado en servidor).
  const peso = Number(data.peso || 0);
  if (peso < 0) throw errorNegocio('El peso no puede ser negativo.', 400);
  const idTarifa = nz(data.id_tarifa_embarque);
  let valorTarifa = 0;
  if (idTarifa != null) {
    const tarifa = await queryOne(
      'SELECT valor, estado FROM cat_tarifa_embarque WHERE codigo = ?', [idTarifa]
    );
    if (!tarifa || String(tarifa.estado).toUpperCase() !== 'ACTIVO') {
      throw errorNegocio('Tarifa de embarque no encontrada o inactiva.', 400);
    }
    valorTarifa = Number(tarifa.valor || 0);
  }
  const factor = await obtenerPorcentajePagos();
  const valor = calcularValor(peso, valorTarifa, factor);

  return {
    num_envio: nz(data.num_envio),
    id_poliza: idPoliza,
    id_transportista: idTransportista,
    id_camion: idCamion,
    id_piloto: idPiloto,
    num_tc: nz(data.num_tc),
    id_tarifa_embarque: nz(data.id_tarifa_embarque),
    fecha: nz(data.fecha),
    tipo: nz(data.tipo),
    cantidad_bultos_piezas: piezas,
    peso,
    valor,
    estado: normalizarEstadoViaje(data.estado),
    observaciones: nz(data.observaciones),
  };
}

const COLUMNAS_INSERT = [
  'num_envio', 'id_poliza', 'id_transportista', 'id_camion', 'id_piloto', 'num_tc',
  'id_tarifa_embarque', 'fecha', 'tipo', 'cantidad_bultos_piezas', 'peso', 'valor',
  'estado', 'observaciones',
];

/** Crea un viaje validando las reglas de negocio. Genera el correlativo del envío. */
async function crear(data, usuario) {
  const row = await validarYNormalizar(data, null);
  const anio = new Date().getFullYear();
  // [2026-08 §5] Viaje local -> se respeta el número de envío escrito a mano.
  const esLocal = String(row.tipo || '').toLowerCase().includes('local');
  const envioManual = row.num_envio != null && String(row.num_envio).trim() !== '';

  return withTransaction(async (conn) => {
    if (esLocal && envioManual) {
      // Evita duplicar el número de envío escrito por el usuario.
      const [dup] = await conn.query(
        'SELECT correlativo FROM `pro_poliza_detalle` WHERE `num_envio` = ? LIMIT 1',
        [String(row.num_envio).trim()]
      );
      if (dup && dup.length) {
        throw errorNegocio(`El número de envío "${row.num_envio}" ya existe.`, 409);
      }
      row.num_envio = String(row.num_envio).trim();
    } else {
      // Carta de Porte / Exportación (o local sin número): correlativo AÑO+00000 en servidor.
      row.num_envio = await siguienteCorrelativo(conn, 'pro_poliza_detalle', 'num_envio', anio);
    }

    const cols = [...COLUMNAS_INSERT, 'usuario_graba'];
    const vals = [...COLUMNAS_INSERT.map((c) => row[c]), usuario || 'sistema'];
    const placeholders = cols.map(() => '?').join(', ');
    const colList = cols.map((c) => `\`${c}\``).join(', ');

    const [result] = await conn.query(
      `INSERT INTO \`pro_poliza_detalle\` (${colList}) VALUES (${placeholders})`,
      vals
    );
    const [rows] = await conn.query(
      'SELECT * FROM `pro_poliza_detalle` WHERE `correlativo` = ?', [result.insertId]
    );
    return rows[0];
  });
}

/**
 * validarCalcular (M2 · sp_validar_calcular_envio en JS)
 * Valida piezas contra el saldo de la póliza y calcula el valor del envío.
 * @param {object} data { id_poliza, id_tarifa_embarque, cantidad_piezas, peso_kg }
 * @returns {Promise<{saldo_piezas:number, valor:number, mensaje:string}>}
 */
async function validarCalcular(data) {
  const idPoliza = requerirNumero(data.id_poliza, 'id_poliza');
  const idTarifa = requerirNumero(data.id_tarifa_embarque, 'id_tarifa_embarque');
  const piezas = Number(data.cantidad_piezas || 0);
  const peso = Number(data.peso_kg || 0);

  const poliza = await queryOne('SELECT cantidad_piezas FROM man_poliza WHERE codigo = ?', [idPoliza]);
  if (!poliza) throw errorNegocio('Poliza no encontrada', 404);
  const total = Number(poliza.cantidad_piezas || 0);
  if (piezas > total) {
    throw errorNegocio(`No puede poner mayor a las piezas de la poliza. Total poliza: ${total} piezas.`);
  }

  const agg = await queryOne(
    `SELECT COALESCE(SUM(cantidad_bultos_piezas), 0) AS usadas
       FROM pro_poliza_detalle WHERE id_poliza = ? AND estado <> ?`,
    [idPoliza, ESTADO_ANULADA]
  );
  const saldo = total - Number(agg.usadas || 0);
  if (piezas > saldo) {
    throw errorNegocio(`Se paso del saldo restante del envio. Saldo disponible: ${saldo} piezas.`);
  }

  const tarifa = await queryOne('SELECT valor, estado FROM cat_tarifa_embarque WHERE codigo = ?', [idTarifa]);
  if (!tarifa || String(tarifa.estado).toUpperCase() !== 'ACTIVO') {
    throw errorNegocio('Tarifa de embarque no encontrada o inactiva');
  }
  const factor = await obtenerPorcentajePagos();
  const valor = calcularValor(peso, tarifa.valor, factor);
  return {
    saldo_piezas: saldo,
    valor,
    mensaje: `OK. Valor calculado: Q${valor.toFixed(2)}. Saldo piezas restante: ${saldo}`,
  };
}

/** Actualiza un viaje (re-valida saldo excluyendo el propio registro). */
async function actualizar(id, data, usuario) {
  const correlativo = requerirNumero(id, 'correlativo');
  const existe = await queryOne('SELECT correlativo FROM `pro_poliza_detalle` WHERE `correlativo` = ?', [correlativo]);
  if (!existe) throw errorNegocio('Viaje no encontrado.', 404);

  const row = await validarYNormalizar(data, correlativo);

  const setCols = [...COLUMNAS_INSERT, 'usuario_graba'];
  const setParts = setCols.map((c) => `\`${c}\` = ?`).join(', ');
  const vals = [...COLUMNAS_INSERT.map((c) => row[c]), usuario || 'sistema', correlativo];

  await execute(
    `UPDATE \`pro_poliza_detalle\` SET ${setParts} WHERE \`correlativo\` = ?`,
    vals
  );
  return queryOne('SELECT * FROM `pro_poliza_detalle` WHERE `correlativo` = ?', [correlativo]);
}

/**
 * tarifasDePoliza — [2026-08 §2] Tarifas de embarque usadas por los envíos de una
 * póliza (para el modal "Retarifar"). Agrupa por tarifa con # de envíos, peso y
 * valor acumulado. Solo envíos NO anulados.
 */
function validarRangoFechas(fechaInicio, fechaFin) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(String(fechaInicio || '')) || !iso.test(String(fechaFin || ''))) {
    throw errorNegocio('La fecha de inicio y la fecha final son obligatorias.', 400);
  }
  if (fechaInicio > fechaFin) {
    throw errorNegocio('La fecha de inicio no puede ser posterior a la fecha final.', 400);
  }
}

async function tarifasDePoliza(idPoliza, fechaInicio, fechaFin) {
  const id = requerirNumero(idPoliza, 'id_poliza');
  validarRangoFechas(fechaInicio, fechaFin);
  return query(
    `SELECT d.id_tarifa_embarque,
            t.origen, t.destino, t.valor AS valor_tarifa,
            COUNT(*)                    AS num_envios,
            COALESCE(SUM(d.peso), 0)    AS suma_peso,
            COALESCE(SUM(d.valor), 0)   AS suma_valor
       FROM pro_poliza_detalle d
       LEFT JOIN cat_tarifa_embarque t ON t.codigo = d.id_tarifa_embarque
      WHERE d.id_poliza = ? AND d.estado <> ? AND d.id_tarifa_embarque IS NOT NULL
        AND d.fecha BETWEEN ? AND ?
      GROUP BY d.id_tarifa_embarque, t.origen, t.destino, t.valor
      ORDER BY num_envios DESC`,
    [id, ESTADO_ANULADA, fechaInicio, fechaFin]
  );
}

/**
 * retarifarPoliza — [2026-08 §2] Recalcula el VALOR de todos los envíos NO anulados
 * de la póliza que usan la tarifa indicada, con la fórmula:
 *   valor = peso × porcentaje_pagos × nueva_tarifa
 * Guarda el resultado en pro_poliza_detalle.valor. Devuelve cuántos se actualizaron.
 */
async function retarifarPoliza(idPoliza, idTarifa, nuevaTarifa, fechaInicio, fechaFin, usuario) {
  const id = requerirNumero(idPoliza, 'id_poliza');
  const tar = requerirNumero(idTarifa, 'id_tarifa_embarque');
  validarRangoFechas(fechaInicio, fechaFin);
  const nueva = Number(nuevaTarifa);
  if (!Number.isFinite(nueva) || nueva < 0) {
    throw errorNegocio('El valor de la nueva tarifa no es válido.', 400);
  }

  const factor = await obtenerPorcentajePagos();

  return withTransaction(async (conn) => {
    const [envios] = await conn.query(
      `SELECT correlativo, peso FROM \`pro_poliza_detalle\`
        WHERE id_poliza = ? AND id_tarifa_embarque = ? AND estado <> ?
          AND fecha BETWEEN ? AND ?`,
      [id, tar, ESTADO_ANULADA, fechaInicio, fechaFin]
    );
    if (!envios.length) {
      throw errorNegocio('No hay envíos con esa tarifa en la póliza para actualizar.', 404);
    }
    let actualizados = 0;
    let totalValor = 0;
    for (const e of envios) {
      const valor = calcularValor(e.peso, nueva, factor);
      // eslint-disable-next-line no-await-in-loop
      await conn.query(
        'UPDATE `pro_poliza_detalle` SET `valor` = ?, `usuario_graba` = ? WHERE `correlativo` = ?',
        [valor, usuario || 'sistema', e.correlativo]
      );
      actualizados += 1;
      totalValor += valor;
    }
    return {
      actualizados,
      total_valor: Number(totalValor.toFixed(2)),
      nueva_tarifa: nueva,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      factor,
    };
  });
}

/** Cambia el estado (normaliza al ENUM: ACTIVO/ANULADO/LIQUIDADO). */
async function cambiarEstado(id, estado, usuario) {
  const correlativo = requerirNumero(id, 'correlativo');
  const est = normalizarEstadoViaje(estado);
  await execute(
    'UPDATE `pro_poliza_detalle` SET `estado` = ?, `usuario_graba` = ? WHERE `correlativo` = ?',
    [est, usuario || 'sistema', correlativo]
  );
  return queryOne('SELECT * FROM `pro_poliza_detalle` WHERE `correlativo` = ?', [correlativo]);
}

module.exports = {
  FACTOR_KG_LB,
  listar,
  resumenPoliza,
  validarCalcular,
  crear,
  actualizar,
  cambiarEstado,
  tarifasDePoliza,
  retarifarPoliza,
};
