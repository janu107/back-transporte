/**
 * cargaMasivaViajes.service.js — [V9 §1] CARGA MASIVA DE VIAJES.
 *
 * Recibe las filas de un archivo (Excel/CSV) con 9 columnas, en este orden:
 *   1 LICENCIA · 2 ENVIO · 3 TIPO · 4 PLACA · 5 PUNTO · 6 PESO
 *   7 CANTIDAD_BULTO · 8 FECHA · 9 VALOR
 * La póliza NO viene en el archivo: es la seleccionada en pantalla.
 *
 * TIPO define de dónde sale el número de envío:
 *   C (Carta de Porte) -> correlativo automático del sistema (ignora la columna)
 *   V (Viaje local)    -> se usa el número que trae el Excel
 *
 * Normalizaciones:
 *   LICENCIA -> sin espacios
 *   PLACA    -> sin espacios y sin los prefijos C-, P-, C, P
 *   FECHA    -> DD/MM/AAAA (también acepta AAAA-MM-DD y fechas de Excel)
 *   PUNTO / PESO / CANTIDAD_BULTO / VALOR -> numéricos
 *
 * Valida fila por fila —placa, licencia, punto, tipo y póliza deben existir— y
 * devuelve el detalle de las correctas y de las rechazadas con su motivo. Al
 * aplicar solo se insertan las correctas, dentro de una transacción, respetando
 * el saldo de peso de la póliza.
 */
const { query, queryOne, withTransaction } = require('../database/db');
const { siguienteCorrelativo } = require('../utils/correlativo');
const { obtenerPorcentajePagos } = require('./configuracion.service');

const ESTADO_ANULADA = 'ANULADO';
const TIPO_LOCAL = 'Viajes Locales';
const TIPO_CARTA = 'Carta de Porte';

function errorNegocio(mensaje, status = 409) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

/** Quita todos los espacios (equivale a REPLACE(...,' ','') del legacy). */
const sinEspacios = (v) => String(v ?? '').replace(/\s+/g, '');
const recortar = (v) => String(v ?? '').trim();

/**
 * Normaliza una placa quitando espacios y los prefijos con que suele venir
 * en los archivos: "C-123ABC", "P-123ABC", "C123ABC", "P123ABC" -> "123ABC".
 * Solo se quita la letra suelta cuando lo que sigue empieza por dígito, para
 * no mutilar placas que legítimamente comienzan con C o P.
 */
function normalizarPlaca(v) {
  const s = sinEspacios(v).toUpperCase();
  return s.replace(/^[CP]-/, '').replace(/^[CP](?=\d)/, '');
}

/** Tipo del archivo: C = Carta de Porte, V = Viaje local. */
function normalizarTipo(v) {
  const s = recortar(v).toUpperCase();
  if (!s) return null;
  if (s === 'C' || s.startsWith('CARTA')) return 'C';
  if (s === 'V' || s.startsWith('VIAJE')) return 'V';
  return null;
}

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
    // Lo ya consumido se agrupa POR PUNTO DE EMBARQUE: los puntos son tramos
    // encadenados (PORTUARIA → PREDIO ARIZONA y luego PREDIO ARIZONA → SIDEGUA)
    // y las mismas piezas recorren cada tramo, así que cada uno lleva su propio
    // saldo contra el total de la póliza. Sumarlos todos juntos rechazaba
    // archivos correctos con el peso que ya iba en camino por otro tramo.
    query(
      `SELECT id_tarifa_embarque,
              COALESCE(SUM(cantidad_bultos_piezas), 0) AS piezas,
              COALESCE(SUM(peso), 0) AS peso
         FROM pro_poliza_detalle
        WHERE id_poliza = ? AND COALESCE(UPPER(TRIM(estado)), 'ACTIVO') = 'ACTIVO'
        GROUP BY id_tarifa_embarque`,
      [id]
    ),
  ]);

  const porLicencia = new Map(pilotos.map((p) => [sinEspacios(p.licencia).toUpperCase(), p]));
  // Las placas se indexan normalizadas para que "C-123ABC" del archivo case con
  // "123ABC" del catálogo (y viceversa).
  const porPlaca = new Map(camiones.map((c) => [normalizarPlaca(c.placa), c]));
  const porTarifa = new Map(tarifas.map((t) => [Number(t.codigo), t]));

  // Números de envío ya usados: evita duplicar los que vienen en el archivo.
  const usados = await query(
    'SELECT num_envio FROM pro_poliza_detalle WHERE num_envio IS NOT NULL'
  );
  const enviosExistentes = new Set(usados.map((r) => String(r.num_envio).trim()));
  const enviosDelArchivo = new Set();

  const pesoPoliza = Number(poliza.peso_total || poliza.peso_kilogramos || 0);
  const piezasPoliza = Number(poliza.cantidad_piezas || 0);
  // Acumulado por punto de embarque: arranca con lo que ya está grabado y va
  // creciendo con las filas del archivo, tramo por tramo.
  const pesoPorPunto = new Map(usadas.map((u) => [Number(u.id_tarifa_embarque), Number(u.peso || 0)]));
  const piezasPorPunto = new Map(usadas.map((u) => [Number(u.id_tarifa_embarque), Number(u.piezas || 0)]));
  const pesoDe = (pt) => pesoPorPunto.get(Number(pt)) || 0;
  const piezasDe = (pt) => piezasPorPunto.get(Number(pt)) || 0;

  const factor = await obtenerPorcentajePagos();
  const validas = [];
  const errores = [];

  filas.forEach((cruda, indice) => {
    // fila 1 = encabezado del archivo; los datos empiezan en la 2.
    const nroFila = Number(cruda.__fila) || indice + 2;
    const motivos = [];

    const licencia = sinEspacios(cruda.licencia).toUpperCase();
    const envioArchivo = recortar(cruda.envio);
    const tipo = normalizarTipo(cruda.tipo);
    const placa = normalizarPlaca(cruda.placa);
    const punto = aNumero(cruda.punto);
    const peso = aNumero(cruda.peso);
    const bultos = aNumero(cruda.cantidad_bulto);
    const fecha = aFecha(cruda.fecha);
    const valorArchivo = aNumero(cruda.valor);

    const piloto = licencia ? porLicencia.get(licencia) : null;
    const camion = placa ? porPlaca.get(placa) : null;
    const tarifa = Number.isFinite(punto) ? porTarifa.get(Number(punto)) : null;

    if (!licencia) motivos.push('Falta la licencia');
    else if (!piloto) motivos.push(`Licencia "${cruda.licencia}" no registrada`);

    if (!placa) motivos.push('Falta la placa');
    else if (!camion) motivos.push(`Placa "${cruda.placa}" no registrada`);

    if (!tipo) motivos.push(`Tipo "${cruda.tipo ?? ''}" inválido (use V o C)`);

    if (!Number.isFinite(punto)) motivos.push('Punto de embarque inválido');
    else if (!tarifa) motivos.push(`Punto de embarque ${punto} no existe`);

    if (!Number.isFinite(peso) || peso <= 0) motivos.push('Peso inválido');
    if (!fecha) motivos.push('Fecha inválida (use DD/MM/AAAA)');

    // Viaje local (V): el número de envío lo trae el archivo y debe ser único.
    if (tipo === 'V') {
      if (!envioArchivo) motivos.push('Falta el número de envío (obligatorio para tipo V)');
      else if (enviosExistentes.has(envioArchivo)) motivos.push(`El envío "${envioArchivo}" ya existe en el sistema`);
      else if (enviosDelArchivo.has(envioArchivo)) motivos.push(`El envío "${envioArchivo}" está repetido en el archivo`);
    }

    // El piloto debe pertenecer al transportista del camión (misma regla que la captura manual).
    if (piloto && camion && piloto.id_transportista != null && camion.id_transportista != null
        && Number(piloto.id_transportista) !== Number(camion.id_transportista)) {
      motivos.push('El piloto no pertenece al transportista de la placa');
    }

    const datosCrudos = {
      licencia: cruda.licencia ?? '', envio: cruda.envio ?? '', tipo: cruda.tipo ?? '',
      placa: cruda.placa ?? '', punto: cruda.punto ?? '', peso: cruda.peso ?? '',
      cantidad_bulto: cruda.cantidad_bulto ?? '', fecha: cruda.fecha ?? '', valor: cruda.valor ?? '',
    };

    if (motivos.length) {
      errores.push({ fila: nroFila, motivo: motivos.join('; '), ...datosCrudos });
      return;
    }

    // Saldo de peso DEL PUNTO DE EMBARQUE de esta fila, acumulando lo que ya
    // llevan las filas anteriores del mismo tramo.
    // `punto` de la fila ya identificó la tarifa; se usa su código como tramo.
    const codPunto = Number(tarifa.codigo);
    const pesoTramo = pesoDe(codPunto);
    if (pesoPoliza > 0 && pesoTramo + peso > pesoPoliza) {
      errores.push({
        fila: nroFila,
        motivo: `Excede el peso de este punto de embarque (disponible `
          + `${(pesoPoliza - pesoTramo).toFixed(2)} kg de ${pesoPoliza.toFixed(2)} kg)`,
        ...datosCrudos,
      });
      return;
    }
    const piezas = Number.isFinite(bultos) && bultos > 0 ? Math.round(bultos) : 0;
    if (piezasPoliza > 0 && piezasDe(codPunto) + piezas > piezasPoliza) {
      errores.push({
        fila: nroFila,
        motivo: `Excede las piezas de este punto de embarque (disponible `
          + `${piezasPoliza - piezasDe(codPunto)} de ${piezasPoliza})`,
        ...datosCrudos,
      });
      return;
    }
    pesoPorPunto.set(codPunto, pesoTramo + peso);
    piezasPorPunto.set(codPunto, piezasDe(codPunto) + piezas);
    if (tipo === 'V') enviosDelArchivo.add(envioArchivo);

    // Valor: se respeta el del archivo; si no viene, se calcula peso × factor × tarifa.
    const valor = Number.isFinite(valorArchivo) && valorArchivo >= 0
      ? Number(valorArchivo.toFixed(2))
      : Number((peso * factor * Number(tarifa.valor || 0)).toFixed(2));

    validas.push({
      fila: nroFila,
      tipo,
      tipo_texto: tipo === 'C' ? TIPO_CARTA : TIPO_LOCAL,
      // En tipo V el número viene del archivo; en tipo C lo asigna el sistema al guardar.
      num_envio: tipo === 'V' ? envioArchivo : null,
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
      fecha,
      peso: Number(peso.toFixed(2)),
      cantidad_bulto: piezas,
      valor,
    });
  });

  const resumen = {
    poliza: { codigo: poliza.codigo, nombre_poliza: poliza.nombre_poliza },
    total_filas: filas.length,
    validas: validas.length,
    con_error: errores.length,
    cartas_porte: validas.filter((v) => v.tipo === 'C').length,
    viajes_locales: validas.filter((v) => v.tipo === 'V').length,
    total_bultos: validas.reduce((s, v) => s + v.cantidad_bulto, 0),
    peso_archivo: Number(validas.reduce((s, v) => s + v.peso, 0).toFixed(2)),
    valor_archivo: Number(validas.reduce((s, v) => s + v.valor, 0).toFixed(2)),
    peso_poliza: pesoPoliza,
    // Se informa el tramo que queda más ajustado, que es el que puede frenar
    // la siguiente carga.
    peso_usado_antes: Number(Math.max(0, ...usadas.map((u) => Number(u.peso || 0)), 0).toFixed(2)),
    saldo_peso_despues: Number((pesoPoliza - Math.max(0, ...pesoPorPunto.values(), 0)).toFixed(2)),
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
  const posibles = [
    ['num_envio', (v) => v.num_envio],
    ['id_poliza', () => id],
    ['id_transportista', (v) => v.id_transportista],
    ['id_camion', (v) => v.id_camion],
    ['id_piloto', (v) => v.id_piloto],
    ['id_tarifa_embarque', (v) => v.id_tarifa_embarque],
    ['fecha', (v) => v.fecha],
    ['tipo', (v) => v.tipo_texto],
    ['cantidad_bultos_piezas', (v) => v.cantidad_bulto],
    ['peso', (v) => v.peso],
    ['valor', (v) => v.valor],
    ['estado', () => 'ACTIVO'],
    ['observaciones', () => 'Carga masiva'],
    ['usuario_graba', () => usuario || 'sistema'],
  ].filter(([nombre]) => existe.has(nombre));

  const colList = posibles.map(([c]) => `\`${c}\``).join(', ');
  const marcadores = posibles.map(() => '?').join(', ');
  const anio = new Date().getFullYear();

  const insertados = await withTransaction(async (conn) => {
    let n = 0;
    for (const v of validas) {
      // Tipo C: correlativo del sistema. Tipo V: el número que trajo el archivo.
      if (v.tipo === 'C') {
        // eslint-disable-next-line no-await-in-loop
        v.num_envio = await siguienteCorrelativo(conn, 'pro_poliza_detalle', 'num_envio', anio);
      }
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
