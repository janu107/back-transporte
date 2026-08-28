-- ---------------------------------------------------------------------
-- cambios_2026_08_factura_seleccionada.sql
--
-- PROBLEMA
--   En «Confirmación de Vales» el usuario elige contra qué factura se cobra el
--   despacho, pero el vale salía cobrado a OTRA. La pantalla solo mandaba el
--   producto y la bomba de la factura elegida, y sp_confirmar_despacho_api
--   escogía la factura por su cuenta:
--
--       WHERE id_producto = ? AND id_bomba = ? AND estado = 'ACTIVO'
--         AND saldo < unidades          -- factura PARCIALMENTE usada
--       ORDER BY saldo ASC, codigo ASC, fecha ASC LIMIT 1
--
--   Es decir, gastaba primero los sobrantes pequeños. La factura recién
--   ingresada (saldo = unidades) nunca podía ser la elegida.
--
-- SOLUCIÓN
--   La selección del usuario se guarda en control_captura_api.api_id_factura_sel
--   y el procedimiento la respeta. Se hace por la tabla y NO por un parámetro
--   nuevo a propósito: así la FIRMA del procedimiento no cambia y el servicio
--   externo (combustible-api, el que llama al SP y manda el correo) sigue
--   funcionando sin tocarle una sola línea.
--
--   Si la columna viene vacía, el procedimiento se comporta EXACTAMENTE igual
--   que antes, así que confirmaciones hechas por otra vía no cambian.
--
-- CÓMO APLICARLO
--   mysql -u Admins -p app_transporte < sql/cambios_2026_08_factura_seleccionada.sql
--
-- Es idempotente: se puede correr más de una vez sin problema.
-- ---------------------------------------------------------------------

-- 1) Columna donde la pantalla deja la factura elegida ------------------
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'control_captura_api'
     AND COLUMN_NAME = 'api_id_factura_sel'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE `control_captura_api`
     ADD COLUMN `api_id_factura_sel` INT DEFAULT NULL
     COMMENT ''Factura elegida en pantalla para cobrar este despacho''',
  'SELECT ''La columna api_id_factura_sel ya existe'' AS aviso');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Procedimiento que respeta esa selección ---------------------------
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
    DECLARE v_fac_sel           INT;            -- factura elegida en pantalla
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
           api_fecha, api_cant_galones, api_manguera, api_surtidor,
           api_id_factura_sel
      INTO v_api_estado, v_api_correla, v_api_num_vale,
           v_api_fecha, v_api_galones, v_api_manguera, v_api_surtidor,
           v_fac_sel
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

    -- --------------------------------------------------------------
    -- FACTURA A: la que eligió el usuario, si la mandó y sigue siendo
    -- válida. Se exige que sea del mismo producto y bomba y que esté
    -- ACTIVO, para que no se cobre a una factura que no corresponde.
    -- --------------------------------------------------------------
    IF v_fac_sel IS NOT NULL THEN
        SELECT codigo, saldo, precio, factura
          INTO v_fac_a_codigo, v_fac_a_saldo, v_fac_a_precio, v_fac_a_num_factura
          FROM man_facturas_vales
         WHERE codigo      = v_fac_sel
           AND id_producto = p_id_producto
           AND id_bomba    = p_id_bomba
           AND estado      = 'ACTIVO'
         LIMIT 1;

        IF v_fac_a_codigo IS NULL THEN
            SIGNAL SQLSTATE '45000'
              SET MESSAGE_TEXT = 'La factura seleccionada ya no esta activa o no corresponde al producto y bomba del despacho';
        END IF;
    ELSE
        -- Sin selección: comportamiento de siempre (gasta primero los
        -- sobrantes, es decir las facturas parcialmente usadas).
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
        SET p_mensaje = CONCAT('Despacho confirmado. Cobrado a la factura ', v_fac_a_num_factura, '.');

    ELSE
        -- No alcanza el saldo de la factura A: se completa con una segunda
        -- factura sin estrenar (saldo = unidades), como hasta ahora.
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

-- Comprobación: debe aparecer la columna nueva y el procedimiento recreado.
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'control_captura_api'
   AND COLUMN_NAME = 'api_id_factura_sel';
