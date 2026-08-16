/**
 * role.middleware.js — Autorización por rol.
 *
 * `autorizar` resuelve a qué módulo pertenece la URL solicitada y valida contra
 * la matriz de config/permisos.js: el rol debe tener acceso al módulo Y poder
 * ejecutar la operación (GET=SELECT, POST=INSERT, PUT/PATCH=UPDATE, DELETE).
 *
 * Un usuario puede tener varios roles; sus permisos son la unión de todos.
 * Todo lo que no esté en el mapa se niega, para que agregar un endpoint nuevo
 * no abra un hueco por olvido.
 */
const { error } = require('../utils/response');
const { operacionDe, puedeOperar, puedeVer } = require('../config/permisos');

/**
 * Rutas de la API -> módulo de la matriz. Se evalúan EN ORDEN: las más
 * específicas van primero (p. ej. /catalogos/tarifa-embarque antes que el
 * resto de catálogos).
 */
const RUTAS = [
  [/^\/control-api(\/|$)/, 'confirmacionApi'],

  [/^\/usuarios(\/|$)/, 'usuarios'],
  [/^\/roles(\/|$)/, 'roles'],
  [/^\/usuario-rol(\/|$)/, 'usuarioRol'],

  [/^\/catalogos\/tipo-camion(\/|$)/, 'tipoCamion'],
  [/^\/catalogos\/tipo-producto(\/|$)/, 'tipoProducto'],
  [/^\/catalogos\/tipo-anticipo-provision(\/|$)/, 'tipoAnticipo'],
  [/^\/catalogos\/ubicacion-bomba(\/|$)/, 'ubicacionBomba'],
  [/^\/catalogos\/productos(\/|$)/, 'productos'],
  [/^\/catalogos\/bombas(\/|$)/, 'bombas'],
  [/^\/catalogos\/tarifa-embarque(\/|$)/, 'tarifaEmbarque'],

  [/^\/configuracion\/empresas(\/|$)/, 'empresas'],
  [/^\/configuracion\/parametros(\/|$)/, 'parametros'],

  [/^\/mantenimientos\/transportistas(\/|$)/, 'transportistas'],
  [/^\/mantenimientos\/pilotos(\/|$)/, 'pilotos'],
  [/^\/mantenimientos\/camiones(\/|$)/, 'camiones'],
  [/^\/mantenimientos\/polizas(\/|$)/, 'polizas'],
  [/^\/mantenimientos\/facturas-vales(\/|$)/, 'facturas'],

  // Registro de viajes (detalle de póliza / envíos)
  [/^\/procesos\/poliza-detalle(\/|$)/, 'detallePolizas'],
  [/^\/viajes(\/|$)/, 'detallePolizas'],
  [/^\/procesos\/anticipo-provision(\/|$)/, 'anticipos'],
  [/^\/anticipos(\/|$)/, 'anticipos'],
  [/^\/procesos\/detalle-facturas(\/|$)/, 'detalleFacturas'],
  [/^\/detalle-factura(\/|$)/, 'detalleFacturas'],

  // Liquidaciones: el módulo v2 comparte prefijo, así que se distingue por sub-ruta.
  [/^\/liquidacion\/v2\/(generar|polizas-disponibles|vista-previa)/, 'liquidacionGeneracion'],
  [/^\/liquidacion\/v2\/(revertir|reversibles)/, 'liquidacionReversion'],
  [/^\/liquidacion\/v2\/sobregiros/, 'liquidacionSobregiros'],
  [/^\/liquidacion\/v2\/(reporte-detallado|resumen-transportista|reporte)/, 'reporteLiquidacion'],
  [/^\/liquidacion(\/|$)/, 'liquidacionHistorial'],
  [/^\/procesos\/liquidaciones(\/|$)/, 'liquidacionHistorial'],

  [/^\/reportes\/diesel(\/|$)/, 'reporteDiesel'],
  [/^\/reportes\/arrastre-polizas(\/|$)/, 'arrastrePolizas'],
  [/^\/reportes\/viajes-poliza(\/|$)/, 'viajesPorPoliza'],
  [/^\/reportes\/polizas-pendientes(\/|$)/, 'polizasPendientes'],
  [/^\/reportes\/anticipos-poliza(\/|$)/, 'anticiposTransportistas'],

  [/^\/bitacoras(\/|$)/, 'bitacoras'],
  [/^\/historial(\/|$)/, 'historial'],
  [/^\/dashboard(\/|$)/, 'dashboard'],

  // Descuentos manuales: forman parte de la liquidación.
  [/^\/procesos\/descuento-/, 'liquidacionGeneracion'],
];

/** Módulo al que pertenece una ruta de la API (null si no está mapeada). */
function moduloDe(ruta) {
  const limpia = String(ruta || '').split('?')[0];
  const encontrado = RUTAS.find(([patron]) => patron.test(limpia));
  return encontrado ? encontrado[1] : null;
}

/** Roles del usuario en sesión (soporta varios; cae al rol único por compatibilidad). */
function rolesDe(req) {
  const u = req.user || {};
  if (Array.isArray(u.roles) && u.roles.length) return u.roles;
  return u.rol ? [u.rol] : [];
}

/** Middleware principal: valida módulo + operación contra la matriz. */
function autorizar(req, res, next) {
  const roles = rolesDe(req);
  if (!roles.length) return error(res, 'Su usuario no tiene un rol asignado.', 403);

  // req.baseUrl trae el prefijo montado (/api) fuera; se arma la ruta relativa.
  const ruta = `${req.baseUrl || ''}${req.path || ''}`.replace(/^\/api/, '');
  const modulo = moduloDe(ruta);
  if (!modulo) {
    return error(res, 'Recurso no autorizado para su rol.', 403);
  }

  if (!puedeVer(roles, modulo)) {
    return error(res, 'No tiene permisos para acceder a este módulo.', 403);
  }

  const operacion = operacionDe(req.method);
  if (!puedeOperar(roles, modulo, operacion)) {
    const detalle = operacion === 'DELETE'
      ? 'Solo un administrador puede eliminar registros.'
      : 'Su rol solo permite consultar este módulo.';
    return error(res, detalle, 403);
  }

  req.modulo = modulo;
  return next();
}

/* ------------------------------------------------------------------ *
 * Compatibilidad: helpers anteriores, aún usados por algunas rutas.   *
 * ------------------------------------------------------------------ */

function permitirRoles(...roles) {
  const permitidos = new Set(['ADMIN', ...roles.map((r) => String(r).toUpperCase())]);
  return (req, res, next) => {
    if (rolesDe(req).some((r) => permitidos.has(String(r).toUpperCase()))) return next();
    return error(res, 'No tiene permisos para acceder a este recurso.', 403);
  };
}

function soloLecturaPara(...roles) {
  const restringidos = new Set(roles.map((r) => String(r).toUpperCase()));
  return (req, res, next) => {
    const esRestringido = rolesDe(req).some((r) => restringidos.has(String(r).toUpperCase()));
    if (esRestringido && !['GET', 'HEAD'].includes(req.method)) {
      return error(res, 'Su rol solo permite consultar este recurso.', 403);
    }
    return next();
  };
}

module.exports = {
  autorizar,
  moduloDe,
  rolesDe,
  permitirRoles,
  soloLecturaPara,
  requireRole: permitirRoles,
};
