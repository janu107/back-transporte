-- Diagnóstico de SOLO LECTURA para producción.
-- No crea, altera ni elimina objetos.

SELECT DATABASE() AS base_actual, VERSION() AS version_motor;

SELECT esperado.tabla,
       CASE WHEN t.TABLE_NAME IS NULL THEN 'FALTA' ELSE 'OK' END AS estado
  FROM (
    SELECT 'pro_liquidaciones' AS tabla
    UNION ALL SELECT 'pro_liquidacion_detalle'
    UNION ALL SELECT 'pro_sobregiro_transportista'
    UNION ALL SELECT 'pro_abonos_transportista'
  ) esperado
  LEFT JOIN information_schema.TABLES t
    ON t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = esperado.tabla
 ORDER BY esperado.tabla;

SELECT esperado.tabla, esperado.columna,
       CASE WHEN c.COLUMN_NAME IS NULL THEN 'FALTA' ELSE 'OK' END AS estado,
       c.COLUMN_TYPE AS tipo_actual
  FROM (
    SELECT 'pro_liquidaciones' AS tabla, 'revertida' AS columna
    UNION ALL SELECT 'pro_liquidaciones', 'motivo_reversion'
    UNION ALL SELECT 'pro_liquidaciones', 'usuario_reversion'
    UNION ALL SELECT 'pro_liquidaciones', 'fecha_reversion'
    UNION ALL SELECT 'pro_liquidaciones', 'id_liq_origen'
    UNION ALL SELECT 'pro_liquidacion_detalle', 'id_liquidacion'
    UNION ALL SELECT 'pro_liquidacion_detalle', 'id_transportista'
    UNION ALL SELECT 'pro_liquidacion_detalle', 'valor_diesel'
    UNION ALL SELECT 'pro_liquidacion_detalle', 'base_gravable'
    UNION ALL SELECT 'pro_liquidacion_detalle', 'porcentaje_impuesto'
    UNION ALL SELECT 'pro_liquidacion_detalle', 'valor_impuesto'
    UNION ALL SELECT 'pro_liquidacion_detalle', 'total_facturar'
    UNION ALL SELECT 'pro_liquidacion_detalle', 'suministro'
    UNION ALL SELECT 'pro_liquidacion_detalle', 'sobregiro_anterior'
    UNION ALL SELECT 'pro_liquidacion_detalle', 'valor_liquidacion'
    UNION ALL SELECT 'pro_sobregiro_transportista', 'valor_abonado'
    UNION ALL SELECT 'pro_sobregiro_transportista', 'id_liquidacion_origen'
    UNION ALL SELECT 'pro_sobregiro_transportista', 'id_liquidacion_aplica'
    UNION ALL SELECT 'pro_abonos_transportista', 'monto'
    UNION ALL SELECT 'pro_abonos_transportista', 'forma_pago'
  ) esperado
  LEFT JOIN information_schema.COLUMNS c
    ON c.TABLE_SCHEMA = DATABASE()
   AND c.TABLE_NAME = esperado.tabla
   AND c.COLUMN_NAME = esperado.columna
 ORDER BY esperado.tabla, esperado.columna;

SELECT esperado.procedimiento,
       CASE WHEN r.ROUTINE_NAME IS NULL THEN 'FALTA' ELSE 'OK' END AS estado
  FROM (
    SELECT 'sp_generar_liquidacion' AS procedimiento
    UNION ALL SELECT 'sp_revertir_liquidacion'
    UNION ALL SELECT 'sp_registrar_abono'
  ) esperado
  LEFT JOIN information_schema.ROUTINES r
    ON r.ROUTINE_SCHEMA = DATABASE()
   AND r.ROUTINE_NAME = esperado.procedimiento
 ORDER BY esperado.procedimiento;

SELECT SPECIFIC_NAME AS procedimiento, ORDINAL_POSITION AS posicion,
       PARAMETER_MODE AS modo, PARAMETER_NAME AS parametro,
       DTD_IDENTIFIER AS tipo
  FROM information_schema.PARAMETERS
 WHERE SPECIFIC_SCHEMA = DATABASE()
   AND SPECIFIC_NAME IN (
     'sp_generar_liquidacion',
     'sp_revertir_liquidacion',
     'sp_registrar_abono'
   )
 ORDER BY SPECIFIC_NAME, ORDINAL_POSITION;
