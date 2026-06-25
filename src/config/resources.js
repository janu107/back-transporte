/**
 * resources.js
 * Definición central de los recursos CRUD. Cada recurso declara su tabla, su
 * clave primaria y las columnas ESCRIBIBLES (whitelist) para evitar inyección
 * de columnas no permitidas. El CRUD genérico (services/crud.service.js) usa
 * esta definición para construir consultas seguras.
 *
 * `usuario_graba` se setea automáticamente en cada INSERT/UPDATE con el usuario
 * en sesión; la bitácora se llena por triggers en la base de datos.
 *
 * Los recursos se identifican por el "slug" usado en las URLs REST.
 */

const RESOURCES = {
  // ---- Catálogos (URL: /catalogos/:recurso) ----
  'tipo-camion': { table: 'cat_tipo_camion', pk: 'codigo', columns: ['descripcion'] },
  'tipo-producto': { table: 'cat_tipo_producto', pk: 'codigo', columns: ['descripcion'] },
  'tipo-anticipo-provision': { table: 'cat_tipo_anticipo_provision', pk: 'codigo', columns: ['descripcion'] },
  'ubicacion-bomba': { table: 'cat_ubicacion_bomba', pk: 'codigo', columns: ['descripcion', 'direccion', 'encargado'] },
  productos: { table: 'cat_productos', pk: 'codigo', columns: ['descripcion', 'id_tipo_producto'] },
  bombas: { table: 'cat_bombas', pk: 'codigo', columns: ['id_ubicacion', 'descripcion', 'mangueras', 'id_producto'] },
  'tarifa-embarque': {
    table: 'cat_tarifa_embarque', pk: 'codigo',
    columns: ['descripcion', 'origen', 'destino', 'valor', 'estado'], hasEstado: true,
  },

  // ---- Mantenimientos (URL: /mantenimientos/:recurso) ----
  transportistas: {
    table: 'man_transportista', pk: 'codigo',
    columns: ['nombre_comercial', 'nit', 'nombres', 'apellidos', 'direccion', 'telefono', 'correo', 'impuesto', 'estado'],
    hasEstado: true,
  },
  pilotos: {
    table: 'man_pilotos', pk: 'codigo',
    columns: ['nombres', 'apellidos', 'id_transportista', 'licencia', 'tipo_licencia', 'fecha_vigencia', 'direccion', 'telefono', 'estado'],
    hasEstado: true,
  },
  camiones: {
    table: 'man_camion', pk: 'codigo',
    columns: ['placa', 'id_transportista', 'id_tipo_camion', 'marca', 'color', 'anio'],
  },
  polizas: {
    table: 'man_poliza', pk: 'codigo',
    columns: ['nombre_poliza', 'id_empresa', 'id_producto', 'fecha', 'fecha_liquidacion', 'descripcion',
      'cantidad_bultos', 'cantidad_piezas', 'peso_quintales', 'peso_kilogramos', 'peso_total', 'estado'],
    hasEstado: true,
  },
  'facturas-vales': {
    table: 'man_facturas_vales', pk: 'codigo',
    columns: ['factura', 'id_producto', 'id_bomba', 'descripcion_compra', 'fecha', 'unidades', 'precio', 'saldo', 'estado'],
    hasEstado: true,
  },

  // ---- Procesos (URL: /procesos/:recurso) ----
  'poliza-detalle': {
    table: 'pro_poliza_detalle', pk: 'correlativo',
    columns: ['num_envio', 'id_poliza', 'id_transportista', 'id_camion', 'id_piloto', 'id_tarifa_embarque',
      'fecha', 'tipo', 'cantidad_bultos_piezas', 'peso', 'valor', 'estado', 'observaciones'],
    hasEstado: true,
  },
  'anticipo-provision': {
    table: 'pro_anticipo_provision', pk: 'correlativo',
    columns: ['num_anticipo', 'id_poliza', 'id_transportista', 'id_camion', 'id_piloto', 'id_tipo_anticipo_provision',
      'fecha', 'valor', 'estado', 'descripcion'],
    hasEstado: true,
  },
  'detalle-facturas': {
    table: 'pro_detalle_facturas', pk: 'correlativo',
    columns: ['num_vale', 'id_factura_vale', 'id_poliza', 'id_transportista', 'id_camion', 'id_piloto', 'fecha', 'cantidad', 'total'],
  },
  liquidaciones: {
    table: 'pro_liquidaciones', pk: 'correlativo',
    columns: ['num_liquidacion', 'id_poliza', 'id_transportista', 'cantidad_viajes', 'valor_viajes', 'cantidad_vale',
      'valor_vales', 'cantidad_anticipos', 'valor_anticipos', 'valor_liquidacion', 'estado', 'fecha_liquidacion'],
    hasEstado: true,
  },

  // ---- Seguridad ----
  roles: { table: 'adm_roles', pk: 'codigo', columns: ['tipo_rol', 'descripcion', 'estado'], hasEstado: true },
  'usuario-rol': { table: 'adm_usuario_rol', pk: 'codigo', columns: ['id_usuario', 'id_rol', 'estado'], hasEstado: true },

  // ---- Configuración ----
  empresas: {
    table: 'con_empresas', pk: 'codigo',
    columns: ['nit', 'nombre', 'direccion', 'telefono', 'correo', 'estado'], hasEstado: true,
  },
};

/** Devuelve la definición de un recurso o lanza error 404 si no existe. */
function getResource(slug) {
  const def = RESOURCES[slug];
  if (!def) {
    const err = new Error(`Recurso no válido: ${slug}`);
    err.status = 404;
    throw err;
  }
  return def;
}

module.exports = { RESOURCES, getResource };
