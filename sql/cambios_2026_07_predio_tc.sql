-- =====================================================================
--  MIGRACIÓN 2026-07  ·  SETRASA / app_transporte
--  Cambios:
--    1) control_captura_api.api_id_ubicacion  -> predio asignable por vale
--       (Confirmación de Vales). Nullable, SIN FK: la tabla la alimenta el
--       worker externo combustible-api; se evita romper sus INSERT.
--    2) pro_poliza_detalle.num_tc  -> No. de Tarjeta de Circulación
--       (Registro de Viajes).
--
--  Idempotente: sólo agrega la columna si no existe (MySQL 5.7/8 no soporta
--  ADD COLUMN IF NOT EXISTS de forma portable, se usa information_schema).
-- =====================================================================

-- ---------------------------------------------------------------------
--  1) control_captura_api.api_id_ubicacion
-- ---------------------------------------------------------------------
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'control_captura_api'
     AND COLUMN_NAME  = 'api_id_ubicacion'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE `control_captura_api`
     ADD COLUMN `api_id_ubicacion` INT NULL DEFAULT NULL AFTER `api_surtidor`,
     ADD KEY `idx_api_ubicacion` (`api_id_ubicacion`)',
  'SELECT "control_captura_api.api_id_ubicacion ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
--  2) pro_poliza_detalle.num_tc
-- ---------------------------------------------------------------------
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'pro_poliza_detalle'
     AND COLUMN_NAME  = 'num_tc'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE `pro_poliza_detalle`
     ADD COLUMN `num_tc` VARCHAR(30) NULL DEFAULT NULL AFTER `id_camion`',
  'SELECT "pro_poliza_detalle.num_tc ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
