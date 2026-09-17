-- =====================================================================
-- control_captura_api.sql  — Módulo CONTROL DEL API (Confirmación de Vales)
-- Sistema Administrativo de Transporte (SETRASA)
--
-- ⚠️  EL SERVIDOR DE PRODUCCIÓN YA TIENE ESTOS OBJETOS (tabla, SP y la versión
--     extendida de pro_detalle_facturas). La tabla `control_captura_api` la
--     crea y la alimenta el proceso externo `combustible-api` (DieselPlus).
--     NO ejecutes este script en el servidor.
--
-- Este script es para entornos LOCALES de desarrollo: deja la base local
-- IDÉNTICA a la del servidor para poder probar la pantalla con realismo.
-- Refleja el esquema y el procedimiento REALES leídos del servidor.
--
-- Ejecutar (LOCAL) después de app_transporte.sql:
--     mysql app_transporte < sql/control_captura_api.sql
--     mysql app_transporte < sql/cruce_dos_facturas_confirmacion.sql  (el SP)
--     mysql app_transporte < sql/seeds_pruebas_control_api.sql   (datos de soporte)
-- =====================================================================
USE `app_transporte`;

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
--  TABLA control_captura_api  (esquema REAL del servidor / combustible-api)
--  Si ya existe (server o local), se omite.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `control_captura_api` (
  `api_id` INT NOT NULL AUTO_INCREMENT,
  `api_numero` BIGINT DEFAULT NULL,
  `api_correla_numero` BIGINT DEFAULT NULL,
  `api_num_vale` INT DEFAULT NULL,
  `api_fecha` DATETIME NOT NULL,
  `api_cant_galones` DECIMAL(16,2) NOT NULL DEFAULT '0.00',
  `api_id_piloto` BIGINT DEFAULT NULL,
  `api_licencia` VARCHAR(25) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `api_nombre_piloto` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `api_id_vehiculo` BIGINT DEFAULT NULL,
  `api_placa` VARCHAR(25) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `api_descripcion` VARCHAR(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `api_manguera` INT DEFAULT NULL,
  `api_surtidor` INT DEFAULT NULL,
  `api_estado` CHAR(1) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'P',
  `api_fecha_crea` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `api_id_piloto_conf` INT DEFAULT NULL,
  `api_id_vehiculo_conf` INT DEFAULT NULL,
  `api_usuario_conf` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `api_fecha_conf` DATETIME DEFAULT NULL,
  `api_id_detalle_fact` INT DEFAULT NULL,
  PRIMARY KEY (`api_id`),
  UNIQUE KEY `uq_api_correla` (`api_correla_numero`),
  KEY `idx_api_estado` (`api_estado`),
  KEY `idx_api_fecha` (`api_fecha`),
  KEY `idx_api_correla` (`api_correla_numero`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  pro_detalle_facturas  (esquema REAL extendido del servidor)
--  ⚠️ SOLO LOCAL: recrea la tabla con las columnas que usa el SP
--     (origen, id_api_origen, api_correla_num, manguera, surtidor).
--     En el servidor ya está así; NO correr ahí.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `pro_detalle_facturas`;
CREATE TABLE `pro_detalle_facturas` (
  `correlativo` INT NOT NULL AUTO_INCREMENT,
  `num_vale` VARCHAR(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_factura_vale` INT NOT NULL,
  `id_poliza` INT NOT NULL,
  `id_transportista` INT NOT NULL,
  `id_camion` INT NOT NULL,
  `id_piloto` INT NOT NULL,
  `fecha` DATE NOT NULL,
  `cantidad` DECIMAL(12,2) NOT NULL DEFAULT '0.00',
  `total` DECIMAL(12,2) NOT NULL DEFAULT '0.00',
  `origen` CHAR(1) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'M',
  `id_api_origen` INT DEFAULT NULL,
  `api_correla_num` INT DEFAULT NULL,
  `manguera` INT DEFAULT NULL,
  `surtidor` INT DEFAULT NULL,
  -- Un vale anulado devuelve su galonaje: el saldo de la factura solo cuenta
  -- los ACTIVO. En el servidor la agrego cambios_2026_08_liquidacion_v2.sql.
  `estado` VARCHAR(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVO',
  `usuario_graba` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`correlativo`),
  KEY `fk_detfact_facturavale` (`id_factura_vale`),
  KEY `fk_detfact_poliza` (`id_poliza`),
  KEY `fk_detfact_transportista` (`id_transportista`),
  KEY `fk_detfact_camion` (`id_camion`),
  KEY `fk_detfact_piloto` (`id_piloto`),
  KEY `idx_detfact_origen` (`origen`),
  KEY `idx_detfact_api_corr` (`api_correla_num`),
  CONSTRAINT `fk_detfact_camion` FOREIGN KEY (`id_camion`) REFERENCES `man_camion` (`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_detfact_facturavale` FOREIGN KEY (`id_factura_vale`) REFERENCES `man_facturas_vales` (`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_detfact_piloto` FOREIGN KEY (`id_piloto`) REFERENCES `man_pilotos` (`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_detfact_poliza` FOREIGN KEY (`id_poliza`) REFERENCES `man_poliza` (`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_detfact_transportista` FOREIGN KEY (`id_transportista`) REFERENCES `man_transportista` (`codigo`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
--  PROCEDIMIENTO sp_confirmar_despacho_api
--
--  Ya NO se define aqui. Vivia en dos archivos y las dos copias se
--  desincronizaron: este espejo se quedo con una version vieja mientras el
--  servidor corria otra. Ahora hay un solo lugar:
--
--      sql/cruce_dos_facturas_confirmacion.sql
--
--  Ejecutalo DESPUES de este archivo (local y servidor usan el mismo):
--      mysql app_transporte < sql/cruce_dos_facturas_confirmacion.sql
-- ---------------------------------------------------------------------

-- Fin del modulo CONTROL DEL API (espejo local del servidor).
