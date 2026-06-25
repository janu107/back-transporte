/**
 * bitacoras.controller.js
 * Consolida todas las tablas de bitácora (B*) en una vista unificada con filtros
 * por módulo, operación, usuario y rango de fechas.
 *
 * Cada bitácora aporta: operacion, módulo (nombre de tabla principal),
 * codigo/correlativo, usuario_accion y fecha_hora_accion.
 */
const { query } = require('../database/db');
const { success } = require('../utils/response');

// Tabla de bitácora -> { modulo (tabla principal), pk en la bitácora }
const BITACORAS = [
  ['Badm_roles', 'adm_roles', 'codigo'],
  ['Badm_usuarios', 'adm_usuarios', 'codigo'],
  ['Badm_usuario_rol', 'adm_usuario_rol', 'codigo'],
  ['Bcat_tipo_camion', 'cat_tipo_camion', 'codigo'],
  ['Bcat_tipo_producto', 'cat_tipo_producto', 'codigo'],
  ['Bcat_tipo_anticipo_provision', 'cat_tipo_anticipo_provision', 'codigo'],
  ['Bcat_ubicacion_bomba', 'cat_ubicacion_bomba', 'codigo'],
  ['Bcat_productos', 'cat_productos', 'codigo'],
  ['Bcat_bombas', 'cat_bombas', 'codigo'],
  ['Bcat_tarifa_embarque', 'cat_tarifa_embarque', 'codigo'],
  ['Bcon_empresas', 'con_empresas', 'codigo'],
  ['Bcon_parametros', 'con_parametros', 'codigo'],
  ['Bman_transportista', 'man_transportista', 'codigo'],
  ['Bman_pilotos', 'man_pilotos', 'codigo'],
  ['Bman_camion', 'man_camion', 'codigo'],
  ['Bman_poliza', 'man_poliza', 'codigo'],
  ['Bman_facturas_vales', 'man_facturas_vales', 'codigo'],
  ['Bpro_poliza_detalle', 'pro_poliza_detalle', 'correlativo'],
  ['Bpro_anticipo_provision', 'pro_anticipo_provision', 'correlativo'],
  ['Bpro_detalle_facturas', 'pro_detalle_facturas', 'correlativo'],
  ['Bpro_liquidaciones', 'pro_liquidaciones', 'correlativo'],
];

module.exports = {
  async list(req, res, next) {
    try {
      const { modulo, operacion, usuario, fechaInicio, fechaFin } = req.query;

      // Si se filtra por módulo, limita las subconsultas a esa tabla principal
      const fuentes = modulo
        ? BITACORAS.filter(([, mod]) => mod === modulo)
        : BITACORAS;

      if (fuentes.length === 0) return success(res, []);

      const selects = fuentes.map(
        ([btabla, mod, pk]) =>
          `SELECT bitacora_id, operacion, '${mod}' AS modulo, \`${pk}\` AS codigo,
                  usuario_accion, fecha_hora_accion
             FROM \`${btabla}\``
      );

      const where = [];
      const params = [];
      if (operacion) { where.push('operacion = ?'); params.push(operacion); }
      if (usuario) { where.push('usuario_accion LIKE ?'); params.push(`%${usuario}%`); }
      if (fechaInicio) { where.push('fecha_hora_accion >= ?'); params.push(`${fechaInicio} 00:00:00`); }
      if (fechaFin) { where.push('fecha_hora_accion <= ?'); params.push(`${fechaFin} 23:59:59`); }

      let sql = `SELECT * FROM (\n${selects.join('\nUNION ALL\n')}\n) AS bitacora`;
      if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
      sql += ' ORDER BY fecha_hora_accion DESC, bitacora_id DESC LIMIT 500';

      success(res, await query(sql, params));
    } catch (e) { next(e); }
  },
};
