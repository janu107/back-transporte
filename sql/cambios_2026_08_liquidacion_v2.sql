-- ============================================================================
-- SETRASA · COMPATIBILIDAD DE ESQUEMA PARA LIQUIDACIONES V2 · 2026-08-06
--
-- No crea ni reemplaza los procedimientos sp_generar_liquidacion,
-- sp_revertir_liquidacion y sp_registrar_abono: la especificación indica que
-- sus versiones oficiales ya están definidas en el motor de base de datos.
--
-- La migración es no destructiva. Las filas históricas del modelo anterior se
-- conservan en pro_liquidaciones; los encabezados v2 se distinguen porque
-- id_transportista IS NULL y su desglose vive en pro_liquidacion_detalle.
-- ============================================================================

-- El servidor oficial usa valor_vales/impuesto_pct y no debe recibir las
-- columnas paralelas del modelo local de desarrollo.
SET @liq_v2_modelo_oficial := EXISTS (
  SELECT 1 FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'pro_liquidacion_detalle'
     AND COLUMN_NAME = 'valor_vales'
);

DELIMITER $$
DROP PROCEDURE IF EXISTS `_liq_v2_add_column`$$
CREATE PROCEDURE `_liq_v2_add_column`(
  IN p_tabla VARCHAR(64), IN p_columna VARCHAR(64), IN p_definicion TEXT
)
BEGIN
  IF COALESCE(@liq_v2_modelo_oficial, 0) = 0 AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tabla AND COLUMN_NAME = p_columna
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_tabla, '` ADD COLUMN `', p_columna, '` ', p_definicion);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL `_liq_v2_add_column`('pro_liquidaciones', 'revertida',
  'TINYINT(1) NOT NULL DEFAULT 0 AFTER `estado`');
CALL `_liq_v2_add_column`('pro_liquidaciones', 'motivo_reversion',
  'VARCHAR(500) NULL AFTER `revertida`');
CALL `_liq_v2_add_column`('pro_liquidaciones', 'usuario_reversion',
  'VARCHAR(50) NULL AFTER `motivo_reversion`');
CALL `_liq_v2_add_column`('pro_liquidaciones', 'fecha_reversion',
  'DATETIME NULL AFTER `usuario_reversion`');
CALL `_liq_v2_add_column`('pro_liquidaciones', 'id_liq_origen',
  'INT NULL AFTER `fecha_reversion`');

CREATE TABLE IF NOT EXISTS `pro_liquidacion_detalle` (
  `correlativo`          INT NOT NULL AUTO_INCREMENT,
  `id_liquidacion`       INT NOT NULL,
  `id_transportista`     INT NOT NULL,
  `cantidad_viajes`      INT NOT NULL DEFAULT 0,
  `valor_viajes`         DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `valor_diesel`         DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `cantidad_anticipos`   INT NOT NULL DEFAULT 0,
  `valor_anticipos`      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `base_gravable`        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `porcentaje_impuesto`  DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  `valor_impuesto`       DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total_facturar`       DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total_galones`        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `suministro`           DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `sobregiro_anterior`   DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `valor_liquidacion`    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `fecha_hora_graba`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`correlativo`),
  UNIQUE KEY `uk_liq_v2_transportista` (`id_liquidacion`, `id_transportista`),
  KEY `idx_liq_v2_transportista` (`id_transportista`),
  CONSTRAINT `fk_liq_v2_encabezado` FOREIGN KEY (`id_liquidacion`)
    REFERENCES `pro_liquidaciones` (`correlativo`),
  CONSTRAINT `fk_liq_v2_transportista` FOREIGN KEY (`id_transportista`)
    REFERENCES `man_transportista` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pro_sobregiro_transportista` (
  `correlativo`            INT NOT NULL AUTO_INCREMENT,
  `id_poliza_origen`       INT NOT NULL,
  `id_transportista`       INT NOT NULL,
  `valor_sobregiro`        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `valor_abonado`          DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `id_poliza_aplica`       INT NULL,
  `id_liquidacion_origen`  INT NULL,
  `id_liquidacion_aplica`  INT NULL,
  `estado`                 VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  `usuario_graba`          VARCHAR(50) NOT NULL,
  `fecha_hora_graba`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`correlativo`),
  KEY `idx_sobregiro_transp` (`id_transportista`),
  KEY `idx_sobregiro_estado` (`estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CALL `_liq_v2_add_column`('pro_sobregiro_transportista', 'valor_abonado',
  'DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `valor_sobregiro`');
CALL `_liq_v2_add_column`('pro_sobregiro_transportista', 'id_liquidacion_origen',
  'INT NULL AFTER `id_poliza_aplica`');
CALL `_liq_v2_add_column`('pro_sobregiro_transportista', 'id_liquidacion_aplica',
  'INT NULL AFTER `id_liquidacion_origen`');
CALL `_liq_v2_add_column`('pro_detalle_facturas', 'estado',
  'VARCHAR(20) NOT NULL DEFAULT ''ACTIVO'' AFTER `total`');
SET @ddl = IF(@liq_v2_modelo_oficial = 1,
  'SELECT ''Modelo oficial: no se modifica pro_sobregiro_transportista.estado'' AS info',
  'ALTER TABLE `pro_sobregiro_transportista` MODIFY COLUMN `estado` VARCHAR(20) NOT NULL DEFAULT ''PENDIENTE''');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF(@liq_v2_modelo_oficial = 1,
  'SELECT ''Modelo oficial: no se modifica pro_detalle_facturas.estado'' AS info',
  'ALTER TABLE `pro_detalle_facturas` MODIFY COLUMN `estado` VARCHAR(20) NOT NULL DEFAULT ''ACTIVO''');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `pro_abonos_transportista` (
  `correlativo`       INT NOT NULL AUTO_INCREMENT,
  `id_transportista`  INT NOT NULL,
  `fecha`              DATE NOT NULL,
  `monto`              DECIMAL(14,2) NOT NULL,
  `forma_pago`         VARCHAR(50) NOT NULL,
  `referencia`         VARCHAR(100) NULL,
  `usuario_graba`      VARCHAR(50) NOT NULL,
  `fecha_hora_graba`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`correlativo`),
  KEY `idx_abono_transportista` (`id_transportista`, `fecha`),
  CONSTRAINT `fk_abono_transportista` FOREIGN KEY (`id_transportista`)
    REFERENCES `man_transportista` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS `_liq_v2_add_column`;

-- El backend detecta ambas variantes. Firmas oficiales de producción:
--   CALL sp_generar_liquidacion(id_poliza, aplica_sobregiro, usuario,
--        id_liq_origen, OUT num_liquidacion, OUT id_liquidacion, OUT mensaje);
--   CALL sp_revertir_liquidacion(id_liquidacion, motivo, usuario);
--   CALL sp_registrar_abono(id_transportista, monto, fecha, forma_pago);
