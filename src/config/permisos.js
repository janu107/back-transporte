/**
 * permisos.js — MATRIZ DE PERMISOS POR ROL.
 *
 * Fuente única de la política de acceso del sistema. Define, para cada módulo
 * del menú, qué roles pueden entrar; y para cada rol, qué operaciones puede
 * ejecutar. El frontend tiene una copia equivalente (src/utils/permisos.js)
 * SOLO para ocultar opciones del menú: la validación real ocurre aquí.
 *
 * Roles:
 *   ADMIN              INSERT, UPDATE, SELECT, DELETE   (todo el sistema)
 *   OPERA_VIAJES       INSERT, UPDATE, SELECT           (cartas de porte y viajes locales)
 *   OPERA_VALES        INSERT, UPDATE, SELECT           (vales de diesel y anticipos)
 *   OPERA_LIQUIDACION  INSERT, UPDATE, SELECT           (liquidación de pólizas)
 *   CONSULTAS          SELECT                           (solo consulta)
 *
 * Un usuario puede tener VARIOS roles: sus permisos son la unión de todos.
 */

/** Operaciones que puede ejecutar cada rol (ninguno borra salvo ADMIN). */
const OPERACIONES_POR_ROL = {
  ADMIN: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  OPERA_VIAJES: ['SELECT', 'INSERT', 'UPDATE'],
  OPERA_VALES: ['SELECT', 'INSERT', 'UPDATE'],
  OPERA_LIQUIDACION: ['SELECT', 'INSERT', 'UPDATE'],
  CONSULTAS: ['SELECT'],
};

const TODOS = ['ADMIN', 'OPERA_VIAJES', 'OPERA_VALES', 'OPERA_LIQUIDACION', 'CONSULTAS'];

/**
 * Roles con acceso a cada módulo (una entrada por submenú de la matriz).
 * ADMIN aparece en todos.
 */
const MODULOS = {
  // ---- Control API ----
  confirmacionApi: ['ADMIN', 'OPERA_VALES'],

  // ---- Seguridad ----
  usuarios: ['ADMIN'],
  roles: ['ADMIN'],
  usuarioRol: ['ADMIN'],

  // ---- Catálogos ----
  tipoCamion: ['ADMIN', 'OPERA_VIAJES', 'OPERA_VALES', 'CONSULTAS'],
  tipoProducto: ['ADMIN', 'OPERA_VIAJES', 'OPERA_VALES', 'CONSULTAS'],
  tipoAnticipo: ['ADMIN', 'OPERA_VIAJES', 'OPERA_VALES', 'CONSULTAS'],
  ubicacionBomba: ['ADMIN', 'OPERA_VIAJES', 'OPERA_VALES', 'CONSULTAS'],
  productos: ['ADMIN', 'OPERA_VIAJES', 'OPERA_VALES', 'CONSULTAS'],
  bombas: ['ADMIN', 'OPERA_VIAJES', 'OPERA_VALES', 'CONSULTAS'],
  tarifaEmbarque: ['ADMIN', 'OPERA_LIQUIDACION'],

  // ---- Configuración ----
  empresas: ['ADMIN'],
  parametros: ['ADMIN'],

  // ---- Mantenimientos ----
  transportistas: TODOS,
  pilotos: ['ADMIN', 'OPERA_VIAJES', 'OPERA_VALES', 'CONSULTAS'],
  camiones: ['ADMIN', 'OPERA_VIAJES', 'OPERA_VALES', 'CONSULTAS'],
  polizas: TODOS,
  facturas: ['ADMIN', 'OPERA_LIQUIDACION'],

  // ---- Procesos ----
  detallePolizas: ['ADMIN', 'OPERA_VIAJES', 'OPERA_VALES', 'CONSULTAS'],
  anticipos: ['ADMIN', 'OPERA_VIAJES', 'OPERA_VALES', 'CONSULTAS'],
  detalleFacturas: ['ADMIN', 'OPERA_VALES', 'CONSULTAS'],

  // ---- Liquidaciones ----
  liquidacionGeneracion: ['ADMIN', 'OPERA_LIQUIDACION'],
  liquidacionReversion: ['ADMIN', 'OPERA_LIQUIDACION'],
  liquidacionHistorial: ['ADMIN', 'OPERA_LIQUIDACION'],
  liquidacionSobregiros: ['ADMIN', 'OPERA_LIQUIDACION'],

  // ---- Reportes ----
  reporteLiquidacion: ['ADMIN', 'OPERA_LIQUIDACION'],
  reporteDiesel: ['ADMIN', 'OPERA_VALES', 'OPERA_LIQUIDACION', 'CONSULTAS'],
  arrastreDiesel: ['ADMIN', 'OPERA_VALES', 'OPERA_LIQUIDACION', 'CONSULTAS'],
  arrastrePolizas: TODOS,
  viajesPorPoliza: TODOS,
  polizasPendientes: TODOS,
  anticiposTransportistas: ['ADMIN', 'OPERA_VIAJES', 'OPERA_VALES', 'CONSULTAS'],

  // ---- Auditoría / Historial ----
  bitacoras: ['ADMIN'],
  historial: ['ADMIN', 'CONSULTAS'],

  // Pantalla de inicio: visible para cualquier rol autenticado.
  dashboard: TODOS,
};

/** Método HTTP -> operación de la matriz. */
function operacionDe(metodo) {
  switch (String(metodo || '').toUpperCase()) {
    case 'GET':
    case 'HEAD':
      return 'SELECT';
    case 'POST':
      return 'INSERT';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return 'SELECT';
  }
}

/** Normaliza a lista de roles en mayúsculas (acepta string o arreglo). */
function normalizarRoles(roles) {
  const lista = Array.isArray(roles) ? roles : [roles];
  return lista.filter(Boolean).map((r) => String(r).toUpperCase());
}

/** ¿Alguno de los roles tiene acceso al módulo? */
function puedeVer(roles, modulo) {
  const permitidos = MODULOS[modulo];
  if (!permitidos) return false; // módulo desconocido: se niega por defecto
  return normalizarRoles(roles).some((r) => permitidos.includes(r));
}

/**
 * ¿Alguno de los roles puede ejecutar la operación en el módulo?
 * Debe cumplirse en el MISMO rol: tener acceso al módulo y la operación.
 */
function puedeOperar(roles, modulo, operacion) {
  const permitidos = MODULOS[modulo];
  if (!permitidos) return false;
  const op = String(operacion || 'SELECT').toUpperCase();
  return normalizarRoles(roles).some(
    (r) => permitidos.includes(r) && (OPERACIONES_POR_ROL[r] || []).includes(op)
  );
}

/** Módulos visibles para el conjunto de roles (para armar el menú). */
function modulosPermitidos(roles) {
  return Object.keys(MODULOS).filter((m) => puedeVer(roles, m));
}

module.exports = {
  OPERACIONES_POR_ROL,
  MODULOS,
  ROLES: TODOS,
  operacionDe,
  normalizarRoles,
  puedeVer,
  puedeOperar,
  modulosPermitidos,
};
