-- =====================================================================
--  MIGRACIÓN 2026-07 (v5)  ·  DESCUENTOS DE ACEITE Y ADMINISTRATIVOS
--  Nuevo: tablas para capturar estos descuentos por póliza/transportista,
--  y columnas en pro_liquidaciones para conservarlos históricamente
--  (una liquidación ya confirmada NUNCA se recalcula con datos nuevos).
--  Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1) pro_descuento_aceite
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pro_descuento_aceite` (
  `correlativo`      INT NOT NULL AUTO_INCREMENT,
  `id_poliza`        INT NOT NULL,
  `id_transportista` INT NOT NULL,
  `fecha`            DATE NOT NULL,
  `valor`            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `descripcion`      VARCHAR(250) DEFAULT NULL,
  `estado`           ENUM('ACTIVO','ANULADO') NOT NULL DEFAULT 'ACTIVO',
  `usuario_graba`    VARCHAR(50) NOT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`correlativo`),
  KEY `idx_aceite_poliza` (`id_poliza`),
  KEY `idx_aceite_transp` (`id_transportista`),
  KEY `idx_aceite_estado` (`estado`),
  CONSTRAINT `fk_aceite_poliza` FOREIGN KEY (`id_poliza`) REFERENCES `man_poliza` (`codigo`),
  CONSTRAINT `fk_aceite_transp` FOREIGN KEY (`id_transportista`) REFERENCES `man_transportista` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  2) pro_descuento_administrativo
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pro_descuento_administrativo` (
  `correlativo`      INT NOT NULL AUTO_INCREMENT,
  `id_poliza`        INT NOT NULL,
  `id_transportista` INT NOT NULL,
  `fecha`            DATE NOT NULL,
  `valor`            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `descripcion`      VARCHAR(250) DEFAULT NULL,
  `estado`           ENUM('ACTIVO','ANULADO') NOT NULL DEFAULT 'ACTIVO',
  `usuario_graba`    VARCHAR(50) NOT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`correlativo`),
  KEY `idx_admin_poliza` (`id_poliza`),
  KEY `idx_admin_transp` (`id_transportista`),
  KEY `idx_admin_estado` (`estado`),
  CONSTRAINT `fk_admin_poliza` FOREIGN KEY (`id_poliza`) REFERENCES `man_poliza` (`codigo`),
  CONSTRAINT `fk_admin_transp` FOREIGN KEY (`id_transportista`) REFERENCES `man_transportista` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  3) pro_liquidaciones: columnas para conservar el desglose histórico
-- ---------------------------------------------------------------------
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_liquidaciones' AND COLUMN_NAME = 'valor_aceite'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE `pro_liquidaciones` ADD COLUMN `valor_aceite` DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER `valor_vales`',
  'SELECT "pro_liquidaciones.valor_aceite ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_liquidaciones' AND COLUMN_NAME = 'valor_administrativo'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE `pro_liquidaciones` ADD COLUMN `valor_administrativo` DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER `valor_aceite`',
  'SELECT "pro_liquidaciones.valor_administrativo ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_liquidaciones' AND COLUMN_NAME = 'sobregiro_anterior'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE `pro_liquidaciones` ADD COLUMN `sobregiro_anterior` DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER `valor_administrativo`',
  'SELECT "pro_liquidaciones.sobregiro_anterior ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
