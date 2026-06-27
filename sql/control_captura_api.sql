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
--  PROCEDIMIENTO sp_confirmar_despacho_api  (versión OFICIAL del servidor)
--
--  Firma: (p_api_id, p_id_piloto, p_id_camion, p_id_transportista,
--          p_id_producto, p_id_bomba, p_id_poliza, p_usuario,
--          OUT p_id_detalle_1, OUT p_id_detalle_2, OUT p_hubo_cruce, OUT p_mensaje)
--
--  - Identifica el vale por api_id (PK).
--  - Valida estado 'P' (lanza SIGNAL si ya está 'C'/'A' o no existe).
--  - Toma la factura ACTIVO con saldo < unidades (parcial) para producto+bomba.
--  - Si caben -> 1 registro en pro_detalle_facturas; si no -> cruce con una
--    segunda factura llena (saldo = unidades) -> 2 registros.
--  - Descuenta saldo (estado 'LIQUIDADO' al agotarse) y marca el vale 'C',
--    llenando las columnas _conf (piloto/vehículo/usuario/fecha/detalle).
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS `sp_confirmar_despacho_api`;

DELIMITER $$

CREATE PROCEDURE `sp_confirmar_despacho_api`(
    IN  p_api_id            INT,
    IN  p_id_piloto         INT,
    IN  p_id_camion         INT,
    IN  p_id_transportista  INT,
    IN  p_id_producto       INT,
    IN  p_id_bomba          INT,
    IN  p_id_poliza         INT,
    IN  p_usuario           VARCHAR(50),
    OUT p_id_detalle_1      INT,
    OUT p_id_detalle_2      INT,
    OUT p_hubo_cruce        BOOLEAN,
    OUT p_mensaje           VARCHAR(250)
)
BEGIN
    DECLARE v_api_estado        CHAR(1);
    DECLARE v_api_correla       BIGINT;
    DECLARE v_api_num_vale      BIGINT;
    DECLARE v_api_fecha         DATETIME;
    DECLARE v_api_galones       DECIMAL(16,2);
    DECLARE v_api_manguera      INT;
    DECLARE v_api_surtidor      INT;
    DECLARE v_fac_a_codigo      INT;
    DECLARE v_fac_a_saldo       DECIMAL(12,2);
    DECLARE v_fac_a_precio      DECIMAL(12,2);
    DECLARE v_fac_a_num_factura VARCHAR(50);
    DECLARE v_fac_b_codigo      INT;
    DECLARE v_fac_b_saldo       DECIMAL(12,2);
    DECLARE v_fac_b_precio      DECIMAL(12,2);
    DECLARE v_galones_fac_a     DECIMAL(12,2);
    DECLARE v_galones_fac_b     DECIMAL(12,2);
    DECLARE v_total_disponible  DECIMAL(12,2);
    DECLARE v_total_1           DECIMAL(12,2);
    DECLARE v_total_2           DECIMAL(12,2);
    DECLARE v_ya_confirmado     INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET p_id_detalle_1 = NULL;
    SET p_id_detalle_2 = NULL;
    SET p_hubo_cruce   = FALSE;
    SET p_mensaje      = '';

    SELECT api_estado, api_correla_numero, api_num_vale,
           api_fecha, api_cant_galones, api_manguera, api_surtidor
      INTO v_api_estado, v_api_correla, v_api_num_vale,
           v_api_fecha, v_api_galones, v_api_manguera, v_api_surtidor
      FROM control_captura_api
     WHERE api_id = p_api_id;

    IF v_api_estado IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro del API no encontrado';
    END IF;
    IF v_api_estado = 'C' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este despacho ya fue confirmado';
    END IF;
    IF v_api_estado = 'A' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este despacho fue anulado';
    END IF;

    SELECT COUNT(*) INTO v_ya_confirmado
      FROM pro_detalle_facturas
     WHERE api_correla_num = v_api_correla;

    IF v_ya_confirmado > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El correlativo ya existe en pro_detalle_facturas';
    END IF;

    SELECT codigo, saldo, precio, factura
      INTO v_fac_a_codigo, v_fac_a_saldo, v_fac_a_precio, v_fac_a_num_factura
      FROM man_facturas_vales
     WHERE id_producto = p_id_producto
       AND id_bomba    = p_id_bomba
       AND estado      = 'ACTIVO'
       AND saldo       < unidades
     ORDER BY saldo ASC, codigo ASC, fecha ASC
     LIMIT 1;

    IF v_fac_a_codigo IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No hay factura activa disponible para este producto y bomba';
    END IF;

    IF v_api_galones <= v_fac_a_saldo THEN

        SET v_total_1 = ROUND(v_api_galones * v_fac_a_precio, 2);
        START TRANSACTION;

        INSERT INTO pro_detalle_facturas (
            num_vale, id_factura_vale, id_poliza, id_transportista, id_camion, id_piloto,
            fecha, cantidad, total, origen, id_api_origen, api_correla_num,
            manguera, surtidor, usuario_graba, fecha_hora_graba
        ) VALUES (
            v_api_num_vale, v_fac_a_codigo, p_id_poliza, p_id_transportista, p_id_camion, p_id_piloto,
            DATE(v_api_fecha), v_api_galones, v_total_1, 'A', p_api_id, v_api_correla,
            v_api_manguera, v_api_surtidor, p_usuario, NOW()
        );
        SET p_id_detalle_1 = LAST_INSERT_ID();

        UPDATE man_facturas_vales
           SET saldo  = saldo - v_api_galones,
               estado = CASE WHEN saldo - v_api_galones <= 0 THEN 'LIQUIDADO' ELSE 'ACTIVO' END
         WHERE codigo = v_fac_a_codigo;

        UPDATE control_captura_api
           SET api_estado = 'C', api_id_piloto_conf = p_id_piloto, api_id_vehiculo_conf = p_id_camion,
               api_usuario_conf = p_usuario, api_fecha_conf = NOW(), api_id_detalle_fact = p_id_detalle_1
         WHERE api_id = p_api_id;

        COMMIT;
        SET p_mensaje = 'Despacho confirmado correctamente en una sola factura';

    ELSE

        SELECT codigo, saldo, precio
          INTO v_fac_b_codigo, v_fac_b_saldo, v_fac_b_precio
          FROM man_facturas_vales
         WHERE id_producto = p_id_producto AND id_bomba = p_id_bomba AND estado = 'ACTIVO'
           AND saldo = unidades AND codigo != v_fac_a_codigo
         ORDER BY codigo ASC, fecha ASC
         LIMIT 1;

        IF v_fac_b_codigo IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Saldo insuficiente: no hay segunda factura';
        END IF;

        SET v_total_disponible = v_fac_a_saldo + v_fac_b_saldo;
        IF v_api_galones > v_total_disponible THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Saldo insuficiente entre las dos facturas';
        END IF;

        SET v_galones_fac_a = v_fac_a_saldo;
        SET v_galones_fac_b = v_api_galones - v_fac_a_saldo;
        SET v_total_1 = ROUND(v_galones_fac_a * v_fac_a_precio, 2);
        SET v_total_2 = ROUND(v_galones_fac_b * v_fac_b_precio, 2);

        START TRANSACTION;

        INSERT INTO pro_detalle_facturas (
            num_vale, id_factura_vale, id_poliza, id_transportista, id_camion, id_piloto,
            fecha, cantidad, total, origen, id_api_origen, api_correla_num,
            manguera, surtidor, usuario_graba, fecha_hora_graba
        ) VALUES (
            v_api_num_vale, v_fac_a_codigo, p_id_poliza, p_id_transportista, p_id_camion, p_id_piloto,
            DATE(v_api_fecha), v_galones_fac_a, v_total_1, 'A', p_api_id, v_api_correla,
            v_api_manguera, v_api_surtidor, p_usuario, NOW()
        );
        SET p_id_detalle_1 = LAST_INSERT_ID();

        INSERT INTO pro_detalle_facturas (
            num_vale, id_factura_vale, id_poliza, id_transportista, id_camion, id_piloto,
            fecha, cantidad, total, origen, id_api_origen, api_correla_num,
            manguera, surtidor, usuario_graba, fecha_hora_graba
        ) VALUES (
            v_api_num_vale, v_fac_b_codigo, p_id_poliza, p_id_transportista, p_id_camion, p_id_piloto,
            DATE(v_api_fecha), v_galones_fac_b, v_total_2, 'A', p_api_id, v_api_correla,
            v_api_manguera, v_api_surtidor, p_usuario, NOW()
        );
        SET p_id_detalle_2 = LAST_INSERT_ID();

        UPDATE man_facturas_vales SET saldo = 0, estado = 'LIQUIDADO' WHERE codigo = v_fac_a_codigo;
        UPDATE man_facturas_vales SET saldo = saldo - v_galones_fac_b WHERE codigo = v_fac_b_codigo;

        UPDATE control_captura_api
           SET api_estado = 'C', api_id_piloto_conf = p_id_piloto, api_id_vehiculo_conf = p_id_camion,
               api_usuario_conf = p_usuario, api_fecha_conf = NOW(), api_id_detalle_fact = p_id_detalle_1
         WHERE api_id = p_api_id;

        COMMIT;
        SET p_hubo_cruce = TRUE;
        SET p_mensaje = CONCAT('Cruce de facturas. Factura ', v_fac_a_num_factura,
                               ' liquidada (', v_galones_fac_a, ' gal). Resto: ', v_galones_fac_b, ' gal.');
    END IF;

END$$

DELIMITER ;

-- Fin del módulo CONTROL DEL API (espejo local del servidor).
