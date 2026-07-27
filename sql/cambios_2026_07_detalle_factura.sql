-- =====================================================================
--  MIGRACIÓN 2026-07  ·  DETALLE DE FACTURA (P14)  ·  SETRASA
--  Agrega estado a pro_detalle_facturas para poder ANULAR vales manuales
--  sin borrarlos físicamente. Los vales del SP (combustible-api) quedan
--  con el default 'ACTIVO'.
--  Idempotente (information_schema).
-- =====================================================================
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'pro_detalle_facturas'
     AND COLUMN_NAME  = 'estado'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE `pro_detalle_facturas`
     ADD COLUMN `estado` ENUM(''ACTIVO'',''ANULADO'') NOT NULL DEFAULT ''ACTIVO'' AFTER `total`,
     ADD KEY `idx_detfact_estado` (`estado`)',
  'SELECT "pro_detalle_facturas.estado ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
