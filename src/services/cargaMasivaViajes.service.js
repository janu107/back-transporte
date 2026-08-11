/**
 * cargaMasivaViajes.service.js — [V9 §1] CARGA MASIVA DE VIAJES LOCALES.
 *
 * Recibe las filas de un archivo (Excel/CSV) con 7 columnas, en el mismo orden
 * que el proceso legacy:
 *   1 LICENCIA · 2 TIPCA · 3 PLACA · 4 PUNTO · 5 PESO · 6 FECHA · 7 VALOR
 * La póliza NO viene en el archivo: es la seleccionada en pantalla.
 *
 * Normalización equivalente a la del legacy:
 *   LICENCIA -> sin espacios      TIPCA -> mayúsculas
 *   PLACA    -> recortada         PUNTO/PESO/VALOR -> numéricos
 *   FECHA    -> DD/MM/AAAA
 *
 * Valida fila por fila y devuelve el detalle de las correctas y de las
 * rechazadas con su motivo. Al aplicar solo se insertan las correctas, dentro
 * de una transacción, respetando el saldo de piezas y de peso de la póliza.
 */
const { query, queryOne, withTransaction } = require('../database/db');
const { siguienteCorrelativo } = require('../utils/correlativo');
const { obtenerPorcentajePagos } = require('./configuracion.service');

const ESTADO_ANULADA = 'ANULADO';
const TIPO_LOCAL = 'Viajes Locales';

function errorNegocio(mensaje, status = 409) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

/** Quita todos los espacios (equivale a REPLACE(...,' ','') del legacy). */
const sinEspacios = (v) => String(v ?? '').replace(/\s+/g, '');
const recortar = (v) => String(v ?? '').trim();

/** Convierte a número aceptando coma decimal y separadores de miles. */
function aNumero(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v;
  const limpio = String(v).replace(/\s/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
  return Number(limpio);
}

/**
 * Convierte la fecha del archivo a AAAA-MM-DD. Acepta DD/MM/AAAA (formato del
 * legacy), AAAA-MM-DD, y el número de serie que usa Excel para las fechas.
 */
function aFecha(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  // Serie de Excel: días desde 1899-12-30.
  if (typeof v === 'number' && v > 0 && v < 100000) {
    const base = Date.UTC(1899, 11, 30);
    return new Date(base + v * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); // DD/MM/AAAA
  if (m) {
    let [, d, mes, a] = m;
    if (a.length === 2) a = `20${a}`;
    const iso = `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return Number.isNaN(new Date(iso).getTime()) ? null : iso;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // AAAA-MM-DD
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Póliza destino: debe existir y estar ABIERTA. */
async function polizaDestino(idPoliza) {
  const poliza = await queryOne(
    `SELECT codigo, nombre_poliza, estado, cantidad_piezas, peso_total, peso_kilogramos
       FROM man_poliza WHERE codigo = ?`,
    [idPoliza]
  );
  if (!poliza) throw errorNegocio('La póliza no existe.', 404);
  if (String(poliza.estado).toUpperCase() !== 'ABIERTA') {
    throw errorNegocio(`La póliza no está ABIERTA (estado actual: ${poliza.estado}).`);
  }
  return poliza;
}

/**
 * procesar — valida las filas contra los catálogos y el saldo de la póliza.
 * @param {object} params { id_poliza, filas, aplicar }
 * @param {string} usuario
 */
async function procesar({ id_poliza: idPoliza, filas = [], aplicar = false }, usuario) {
  const id = Number(idPoliza);
  if (!Number.isInteger(id) || id <= 0) throw errorNegocio('Seleccione una póliza válida.', 400);
  if (!Array.isArray(filas) || filas.length === 0) {
    throw errorNegocio('El archivo no contiene filas para cargar.', 400);
  }
  if (filas.length > 5000) {
    throw errorNegocio('El archivo excede el máximo de 5000 filas por carga.', 400);
  }

  const poliza = await polizaDestino(id);

  // Catálogos en memoria: evita una consulta por fila.
  const [pilotos, camiones, tarifas, usadas] = await Promise.all([
    query("SELECT codigo, licencia, nombres, apellidos, id_transportista FROM man_pilotos WHERE UPPER(COALESCE(estado,'ACTIVO')) = 'ACTIVO'"),
    query('SELECT c.codigo, c.placa, c.id_transportista, t.nombre_comercial, t.nit FROM man_camion c LEFT JOIN man_transportista t ON t.codigo = c.id_transportista'),
    query('SELECT codigo, descripcion, origen, destino, valor FROM cat_tarifa_embarque'),
    queryOne(
      `SELECT COALESCE(SUM(cantidad_bultos_piezas), 0) AS piezas,
              COALESCE(SUM(peso), 0) AS peso
         FROM pro_poliza_detalle WHERE id_poliza = ? AND estado <> ?`,
      [id, ESTADO_ANULADA]
    ),
  ]);

  const porLicencia = new Map(pilotos.map((p) => [sinEspacios(p.licencia).toUpperCase(), p]));
  const porPlaca = new Map(camiones.map((c) => [sinEspacios(c.placa).toUpperCase(), c]));
  const porTarifa = new Map(tarifas.map((t) => [Number(t.codigo), t]));

  const pesoPoliza = Number(poliza.peso_total || poliza.peso_kilogramos || 0);
  const piezasPoliza = Number(poliza.cantidad_piezas || 0);
  let pesoAcumulado = Number(usadas.peso || 0);
  let piezasAcumuladas = Number(usadas.piezas || 0);

  const factor = await obtenerPorcentajePagos();
  const validas = [];
  const errores = [];

  filas.forEach((cruda, indice) => {
    // fila 1 = encabezado del archivo; los datos empiezan en la 2.
    const nroFila = Number(cruda.__fila) || indice + 2;
    const motivos = [];

    const licencia = sinEspacios(cruda.licencia).toUpperCase();
    const tipca = recortar(cruda.tipca).toUpperCase();
    const placa = sinEspacios(cruda.placa).toUpperCase();
    const punto = aNumero(cruda.punto);
    const peso = aNumero(cruda.peso);
    const fecha = aFecha(cruda.fecha);
    const valorArchivo = aNumero(cruda.valor);

    const piloto = licencia ? porLicencia.get(licencia) : null;
    const camion = placa ? porPlaca.get(placa) : null;
    const tarifa = Number.isFinite(punto) ? porTarifa.get(Number(punto)) : null;

    if (!licencia) motivos.push('Falta la licencia');
    else if (!piloto) motivos.push(`Licencia "${cruda.licencia}" no registrada`);

    if (!placa) motivos.push('Falta la placa');
    else if (!camion) motivos.push(`Placa "${cruda.placa}" no registrada`);

    if (!Number.isFinite(punto)) motivos.push('Punto de embarque inválido');
    else if (!tarifa) motivos.push(`Punto de embarque ${punto} no existe`);

    if (!Number.isFinite(peso) || peso <= 0) motivos.push('Peso inválido');
    if (!fecha) motivos.push('Fecha inválida (use DD/MM/AAAA)');

    // El piloto debe pertenecer al transportista del camión (misma regla que la captura manual).
    if (piloto && camion && piloto.id_transportista != null && camion.id_transportista != null
        && Number(piloto.id_transportista) !== Number(camion.id_transportista)) {
      motivos.push('El piloto no pertenece al transportista de la placa');
    }

    if (motivos.length) {
      errores.push({
        fila: nroFila, motivo: motivos.join('; '),
        licencia: cruda.licencia ?? '', placa: cruda.placa ?? '',
        punto: cruda.punto ?? '', fecha: cruda.fecha ?? '',
        peso: cruda.peso ?? '', valor: cruda.valor ?? '',
      });
      return;
    }

    // Saldo de peso de la póliza (acumulado a lo largo del archivo).
    if (pesoPoliza > 0 && pesoAcumulado + peso > pesoPoliza) {
      errores.push({
        fila: nroFila,
        motivo: `Excede el peso de la póliza (disponible ${(pesoPoliza - pesoAcumulado).toFixed(2)} kg)`,
        licencia: cruda.licencia ?? '', placa: cruda.placa ?? '',
        punto: cruda.punto ?? '', fecha: cruda.fecha ?? '',
        peso: cruda.peso ?? '', valor: cruda.valor ?? '',
      });
      return;
    }
    pesoAcumulado += peso;
    piezasAcumuladas += 0; // el archivo no trae piezas: los viajes locales entran con 0

    // Valor: se respeta el del archivo; si no viene, se calcula peso × factor × tarifa.
    const valor = Number.isFinite(valorArchivo) && valorArchivo >= 0
      ? Number(valorArchivo.toFixed(2))
      : Number((peso * factor * Number(tarifa.valor || 0)).toFixed(2));

    validas.push({
      fila: nroFila,
      id_piloto: piloto.codigo,
      piloto: `${piloto.nombres} ${piloto.apellidos || ''}`.trim(),
      licencia: piloto.licencia,
      id_camion: camion.codigo,
      placa: camion.placa,
      id_transportista: camion.id_transportista,
      transportista: camion.nombre_comercial || '',
      nit: camion.nit || '',
      id_tarifa_embarque: tarifa.codigo,
      embarque: tarifa.descripcion || `${tarifa.origen || ''} → ${tarifa.destino || ''}`,
      tipca,
      fecha,
      peso: Number(peso.toFixed(2)),
      valor,
    });
  });

  const resumen = {
    poliza: { codigo: poliza.codigo, nombre_poliza: poliza.nombre_poliza },
    total_filas: filas.length,
    validas: validas.length,
    con_error: errores.length,
    peso_archivo: Number(validas.reduce((s, v) => s + v.peso, 0).toFixed(2)),
    valor_archivo: Number(validas.reduce((s, v) => s + v.valor, 0).toFixed(2)),
    peso_poliza: pesoPoliza,
    peso_usado_antes: Number(usadas.peso || 0),
    saldo_peso_despues: Number((pesoPoliza - pesoAcumulado).toFixed(2)),
    piezas_poliza: piezasPoliza,
  };

  // Vista previa: no toca la base.
  if (!aplicar) return { ...resumen, aplicado: false, filas: validas, errores };

  if (!validas.length) {
    throw errorNegocio('No hay filas válidas para cargar.', 400);
  }

  // El INSERT se arma con las columnas que realmente existan: el esquema de
  // pro_poliza_detalle varía entre instalaciones (p. ej. id_transportista solo
  // está donde el viaje no lo resuelve por el camión).
  const columnas = await query(
    `SELECT COLUMN_NAME AS nombre FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_poliza_detalle'`
  );
  const existe = new Set(columnas.map((c) => c.nombre));
  const observacion = (v) => `Carga masiva${v.tipca ? ` · ${v.tipca}` : ''}`;
  const posibles = [
    ['num_envio', (v) => v.num_envio],
    ['id_poliza', () => id],
    ['id_transportista', (v) => v.id_transportista],
    ['id_camion', (v) => v.id_camion],
    ['id_piloto', (v) => v.id_piloto],
    ['id_tarifa_embarque', (v) => v.id_tarifa_embarque],
    ['fecha', (v) => v.fecha],
    ['tipo', () => TIPO_LOCAL],
    ['cantidad_bultos_piezas', () => 0],
    ['peso', (v) => v.peso],
    ['valor', (v) => v.valor],
    ['estado', () => 'ACTIVO'],
    ['observaciones', observacion],
    ['usuario_graba', () => usuario || 'sistema'],
  ].filter(([nombre]) => existe.has(nombre));

  const colList = posibles.map(([c]) => `\`${c}\``).join(', ');
  const marcadores = posibles.map(() => '?').join(', ');
  const anio = new Date().getFullYear();

  const insertados = await withTransaction(async (conn) => {
    let n = 0;
    for (const v of validas) {
      // eslint-disable-next-line no-await-in-loop
      v.num_envio = await siguienteCorrelativo(conn, 'pro_poliza_detalle', 'num_envio', anio);
      // eslint-disable-next-line no-await-in-loop
      await conn.query(
        `INSERT INTO \`pro_poliza_detalle\` (${colList}) VALUES (${marcadores})`,
        posibles.map(([, valor]) => valor(v))
      );
      n += 1;
    }
    return n;
  });

  return { ...resumen, aplicado: true, insertados, filas: validas, errores };
}

module.exports = { procesar, aFecha, aNumero };
