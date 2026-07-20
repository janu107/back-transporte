/**
 * anticipos.service.js
 * ANTICIPOS / PROVISIÓN sobre pro_anticipo_provision.
 *
 * Reglas:
 *   - Número de anticipo (num_anticipo) correlativo AÑO+00000 generado en servidor.
 *   - El transportista se toma del camión (placa) elegido.
 *   - El piloto (si se indica) debe pertenecer al transportista.
 *   - Estado: solo ACTIVO / ANULADO. Al crear siempre inicia en ACTIVO.
 */
const { query, queryOne, execute, withTransaction } = require('../database/db');
const { siguienteCorrelativo } = require('../utils/correlativo');

const nz = (v) => (v === '' || v === undefined ? null : v);

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

async function listar() {
  return query('SELECT * FROM `pro_anticipo_provision` ORDER BY `correlativo` DESC');
}

/** Valida y normaliza el registro. */
async function validarYNormalizar(data) {
  const idPoliza = requerirNumero(data.id_poliza, 'id_poliza');
  const poliza = await queryOne('SELECT codigo FROM man_poliza WHERE codigo = ?', [idPoliza]);
  if (!poliza) throw errorNegocio('La póliza no existe.', 400);

  let idCamion = nz(data.id_camion);
  let idTransportista = nz(data.id_transportista);
  if (idCamion != null) {
    const camion = await queryOne('SELECT codigo, id_transportista FROM man_camion WHERE codigo = ?', [idCamion]);
    if (!camion) throw errorNegocio('El camión (placa) no existe.', 400);
    idTransportista = camion.id_transportista;
  }
  if (idTransportista == null) throw errorNegocio('Seleccione un transportista/placa válido.', 400);

  const idPiloto = nz(data.id_piloto);
  if (idPiloto != null) {
    const piloto = await queryOne('SELECT id_transportista FROM man_pilotos WHERE codigo = ?', [idPiloto]);
    if (!piloto) throw errorNegocio('El piloto no existe.', 400);
    if (Number(piloto.id_transportista) !== Number(idTransportista)) {
      throw errorNegocio('El piloto no pertenece al transportista.');
    }
  }

  const valor = Number(data.valor || 0);
  if (valor < 0) throw errorNegocio('El valor no puede ser negativo.', 400);

  // Estado sólo ACTIVO / ANULADO.
  let estado = String(nz(data.estado) || 'ACTIVO').toUpperCase();
  if (!['ACTIVO', 'ANULADO'].includes(estado)) estado = 'ACTIVO';

  return {
    id_poliza: idPoliza,
    id_transportista: idTransportista,
    id_camion: idCamion,
    id_piloto: idPiloto,
    id_tipo_anticipo_provision: nz(data.id_tipo_anticipo_provision),
    fecha: nz(data.fecha),
    valor,
    estado,
    descripcion: nz(data.descripcion),
  };
}

const COLUMNAS = [
  'num_anticipo', 'id_poliza', 'id_transportista', 'id_camion', 'id_piloto',
  'id_tipo_anticipo_provision', 'fecha', 'valor', 'estado', 'descripcion',
];

/** Crea un anticipo con correlativo AÑO+00000; estado inicia ACTIVO. */
async function crear(data, usuario) {
  const row = await validarYNormalizar(data);
  row.estado = 'ACTIVO'; // al crear, siempre ACTIVO
  const anio = new Date().getFullYear();

  return withTransaction(async (conn) => {
    row.num_anticipo = await siguienteCorrelativo(conn, 'pro_anticipo_provision', 'num_anticipo', anio);
    const cols = [...COLUMNAS, 'usuario_graba'];
    const vals = [...COLUMNAS.map((c) => row[c]), usuario || 'sistema'];
    const placeholders = cols.map(() => '?').join(', ');
    const colList = cols.map((c) => `\`${c}\``).join(', ');
    const [result] = await conn.query(
      `INSERT INTO \`pro_anticipo_provision\` (${colList}) VALUES (${placeholders})`, vals
    );
    const [rows] = await conn.query(
      'SELECT * FROM `pro_anticipo_provision` WHERE `correlativo` = ?', [result.insertId]
    );
    return rows[0];
  });
}

/** Actualiza un anticipo (mantiene el num_anticipo existente). */
async function actualizar(id, data, usuario) {
  const correlativo = requerirNumero(id, 'correlativo');
  const existe = await queryOne('SELECT num_anticipo FROM `pro_anticipo_provision` WHERE `correlativo` = ?', [correlativo]);
  if (!existe) throw errorNegocio('Anticipo no encontrado.', 404);

  const row = await validarYNormalizar(data);
  // No se regenera el correlativo en edición.
  const cols = COLUMNAS.filter((c) => c !== 'num_anticipo');
  const setParts = [...cols.map((c) => `\`${c}\` = ?`), '`usuario_graba` = ?'].join(', ');
  const vals = [...cols.map((c) => row[c]), usuario || 'sistema', correlativo];
  await execute(`UPDATE \`pro_anticipo_provision\` SET ${setParts} WHERE \`correlativo\` = ?`, vals);
  return queryOne('SELECT * FROM `pro_anticipo_provision` WHERE `correlativo` = ?', [correlativo]);
}

/** Cambia el estado (ANULADO / ACTIVO). */
async function cambiarEstado(id, estado, usuario) {
  const correlativo = requerirNumero(id, 'correlativo');
  let est = String(estado || '').toUpperCase();
  if (!['ACTIVO', 'ANULADO'].includes(est)) est = 'ANULADO';
  await execute(
    'UPDATE `pro_anticipo_provision` SET `estado` = ?, `usuario_graba` = ? WHERE `correlativo` = ?',
    [est, usuario || 'sistema', correlativo]
  );
  return queryOne('SELECT * FROM `pro_anticipo_provision` WHERE `correlativo` = ?', [correlativo]);
}

module.exports = { listar, crear, actualizar, cambiarEstado };
