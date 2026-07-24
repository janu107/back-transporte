-- =====================================================================
--  MIGRACIÓN 2026-07  ·  LIQUIDACIÓN DE PÓLIZAS  ·  SETRASA
--  1) con_parametros.valor_galon_combustible (valor del galón, parametrizable)
--  2) pro_sobregiro_transportista (saldos negativos que pasan a la siguiente póliza)
--
--  Idempotente: usa information_schema (no depende de ADD COLUMN IF NOT EXISTS).
--  Tipos de FK alineados a los reales: man_poliza.codigo INT, man_transportista.codigo INT.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1) valor del galón de combustible en parámetros (fila única codigo=1)
-- ---------------------------------------------------------------------
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'con_parametros'
     AND COLUMN_NAME  = 'valor_galon_combustible'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE `con_parametros`
     ADD COLUMN `valor_galon_combustible` DECIMAL(12,2) NOT NULL DEFAULT 1.50 AFTER `isr`',
  'SELECT "con_parametros.valor_galon_combustible ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Asegura que la fila de parámetros exista (codigo = 1).
INSERT INTO `con_parametros` (`codigo`, `usuario_graba`)
SELECT 1, 'sistema'
WHERE NOT EXISTS (SELECT 1 FROM `con_parametros` WHERE `codigo` = 1);

-- ---------------------------------------------------------------------
--  2) tabla de sobregiros por transportista
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pro_sobregiro_transportista` (
  `correlativo`      INT NOT NULL AUTO_INCREMENT,
  `id_poliza_origen` INT NOT NULL,
  `id_transportista` INT NOT NULL,
  `valor_sobregiro`  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `id_poliza_aplica` INT DEFAULT NULL,
  `estado`           ENUM('PENDIENTE','APLICADO') NOT NULL DEFAULT 'PENDIENTE',
  `usuario_graba`    VARCHAR(50) NOT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`correlativo`),
  KEY `idx_sobregiro_transp` (`id_transportista`),
  KEY `idx_sobregiro_pol_origen` (`id_poliza_origen`),
  KEY `idx_sobregiro_pol_aplica` (`id_poliza_aplica`),
  KEY `idx_sobregiro_estado` (`estado`),
  CONSTRAINT `fk_sobregiro_transp` FOREIGN KEY (`id_transportista`) REFERENCES `man_transportista` (`codigo`),
  CONSTRAINT `fk_sobregiro_pol_origen` FOREIGN KEY (`id_poliza_origen`) REFERENCES `man_poliza` (`codigo`),
  CONSTRAINT `fk_sobregiro_pol_aplica` FOREIGN KEY (`id_poliza_aplica`) REFERENCES `man_poliza` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
