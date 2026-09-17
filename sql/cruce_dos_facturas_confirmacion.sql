-- =====================================================================
-- cruce_dos_facturas_confirmacion.sql
-- Confirmacion de Vales: un vale mayor que el saldo de la factura se cobra
-- a DOS facturas (cruce), en vez de rechazarse.
--
-- Reemplaza a evitar_saldo_negativo_confirmacion.sql, que dejaba el vale
-- trabado cuando a la factura en uso le quedaba menos de lo despachado.
--
-- Regla de negocio:
--   La factura elegida en pantalla (A) se consume hasta 0 y queda LIQUIDADO;
--   el resto se cobra a la siguiente factura activa (B). Se graban DOS filas
--   en pro_detalle_facturas con el MISMO numero de vale del API, una por
--   factura. Ninguna factura queda con saldo negativo.
--
--   Ejemplo: vale de 42.00 gal, factura A con 37.89 de saldo
--     A: 37.89 gal -> saldo 0, estado LIQUIDADO
--     B:  4.11 gal -> empieza a rebajarse
--
-- Como se elige la factura B: misma bomba y mismo producto, estado ACTIVO,
-- distinta de A y con saldo suficiente para el resto; la mas antigua primero
-- (fecha, luego codigo). Es FIFO: se termina una factura antes de abrir otra.
-- Si ninguna alcanza, la confirmacion se rechaza completa y no se mueve nada.
--
-- FIRMA SIN CAMBIOS: 9 parametros de entrada + 4 de salida (13 argumentos).
-- combustible-api NO necesita ningun cambio; sigue llamando igual.
--
-- Ejecutar una vez en la base de datos de produccion:
--   node scripts/setup-db.js cruce_dos_facturas_confirmacion.sql
-- =====================================================================

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
    IN  p_id_factura_vale   INT,
    IN  p_usuario           VARCHAR(50),
    OUT p_id_detalle_1      INT,
    OUT p_id_detalle_2      INT,
    OUT p_hubo_cruce        BOOLEAN,
    OUT p_mensaje           VARCHAR(250)
)
BEGIN
    DECLARE v_api_estado    CHAR(1) DEFAULT NULL;
    DECLARE v_api_correla   BIGINT DEFAULT NULL;
    DECLARE v_api_num_vale  BIGINT DEFAULT NULL;
    DECLARE v_api_fecha     DATETIME DEFAULT NULL;
    DECLARE v_api_galones   DECIMAL(16,2) DEFAULT NULL;
    DECLARE v_api_manguera  INT DEFAULT NULL;
    DECLARE v_api_surtidor  INT DEFAULT NULL;

    DECLARE v_a_codigo      INT DEFAULT NULL;
    DECLARE v_a_saldo       DECIMAL(12,2) DEFAULT NULL;
    DECLARE v_a_precio      DECIMAL(12,2) DEFAULT NULL;
    DECLARE v_a_factura     VARCHAR(50) DEFAULT NULL;

    DECLARE v_b_codigo      INT DEFAULT NULL;
    DECLARE v_b_saldo       DECIMAL(12,2) DEFAULT NULL;
    DECLARE v_b_precio      DECIMAL(12,2) DEFAULT NULL;
    DECLARE v_b_factura     VARCHAR(50) DEFAULT NULL;

    DECLARE v_gal_a         DECIMAL(12,2) DEFAULT 0;
    DECLARE v_gal_b         DECIMAL(12,2) DEFAULT 0;
    DECLARE v_duplicado     INT DEFAULT 0;
    DECLARE v_detalle       INT DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET p_id_detalle_1 = NULL;
    SET p_id_detalle_2 = NULL;
    SET p_hubo_cruce   = FALSE;
    SET p_mensaje      = '';

    START TRANSACTION;

    -- ---- El vale del API -------------------------------------------------
    SELECT api_estado, api_correla_numero, api_num_vale, api_fecha,
           api_cant_galones, api_manguera, api_surtidor
      INTO v_api_estado, v_api_correla, v_api_num_vale, v_api_fecha,
           v_api_galones, v_api_manguera, v_api_surtidor
      FROM control_captura_api
     WHERE api_id = p_api_id
     FOR UPDATE;

    IF v_api_estado IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro del API no encontrado';
    END IF;
    IF v_api_estado <> 'P' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este despacho ya no esta pendiente';
    END IF;
    IF v_api_galones IS NULL OR v_api_galones <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El vale no tiene una cantidad valida de galones';
    END IF;

    -- Un despacho del API solo puede estar cobrado una vez, aunque sean dos filas.
    SELECT COUNT(*) INTO v_duplicado
      FROM pro_detalle_facturas
     WHERE id_api_origen = p_api_id;
    IF v_duplicado > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este despacho ya tiene vales generados';
    END IF;

    -- ---- Factura A: la elegida en pantalla -------------------------------
    SELECT codigo, saldo, precio, factura
      INTO v_a_codigo, v_a_saldo, v_a_precio, v_a_factura
      FROM man_facturas_vales
     WHERE codigo = p_id_factura_vale
       AND id_producto = p_id_producto
       AND id_bomba = p_id_bomba
       AND estado = 'ACTIVO'
     FOR UPDATE;

    IF v_a_codigo IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La factura seleccionada no esta activa o no corresponde al producto y bomba';
    END IF;
    IF v_a_saldo IS NULL OR v_a_saldo <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La factura seleccionada no tiene saldo disponible';
    END IF;

    IF v_api_galones <= v_a_saldo THEN
        -- =================================================================
        -- Caso normal: el vale cabe completo en la factura elegida.
        -- =================================================================
        SET v_gal_a = v_api_galones;

        INSERT INTO pro_detalle_facturas (
            num_vale, id_factura_vale, id_poliza, id_transportista, id_camion, id_piloto,
            fecha, cantidad, total, origen, id_api_origen, api_correla_num,
            manguera, surtidor, usuario_graba, fecha_hora_graba
        ) VALUES (
            v_api_num_vale, v_a_codigo, p_id_poliza, p_id_transportista, p_id_camion, p_id_piloto,
            DATE(v_api_fecha), v_gal_a, ROUND(v_gal_a * v_a_precio, 2), 'A', p_api_id, v_api_correla,
            v_api_manguera, v_api_surtidor, p_usuario, NOW()
        );
        SET v_detalle = LAST_INSERT_ID();

        -- La condicion saldo >= galones es una segunda barrera contra saldos negativos.
        UPDATE man_facturas_vales
           SET saldo = saldo - v_gal_a,
               estado = CASE WHEN saldo - v_gal_a <= 0 THEN 'LIQUIDADO' ELSE 'ACTIVO' END
         WHERE codigo = v_a_codigo
           AND estado = 'ACTIVO'
           AND saldo >= v_gal_a;
        IF ROW_COUNT() <> 1 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El saldo de la factura cambio; vuelva a seleccionarla';
        END IF;

        SET p_id_detalle_1 = v_detalle;
        SET p_mensaje = CONCAT('Despacho confirmado. Se descontaron ', v_gal_a,
                               ' gal de la factura ', v_a_factura, '.');
    ELSE
        -- =================================================================
        -- Cruce: la factura elegida se termina y el resto pasa a la siguiente.
        -- =================================================================
        SET v_gal_a = v_a_saldo;
        SET v_gal_b = v_api_galones - v_a_saldo;

        SELECT codigo, saldo, precio, factura
          INTO v_b_codigo, v_b_saldo, v_b_precio, v_b_factura
          FROM man_facturas_vales
         WHERE id_producto = p_id_producto
           AND id_bomba = p_id_bomba
           AND estado = 'ACTIVO'
           AND codigo <> v_a_codigo
           AND saldo >= v_gal_b
         ORDER BY fecha ASC, codigo ASC
         LIMIT 1
         FOR UPDATE;

        IF v_b_codigo IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Saldo insuficiente: no hay una segunda factura activa que cubra el resto del vale. Registre la siguiente factura.';
        END IF;

        -- Fila 1: lo que alcanza en la factura elegida.
        INSERT INTO pro_detalle_facturas (
            num_vale, id_factura_vale, id_poliza, id_transportista, id_camion, id_piloto,
            fecha, cantidad, total, origen, id_api_origen, api_correla_num,
            manguera, surtidor, usuario_graba, fecha_hora_graba
        ) VALUES (
            v_api_num_vale, v_a_codigo, p_id_poliza, p_id_transportista, p_id_camion, p_id_piloto,
            DATE(v_api_fecha), v_gal_a, ROUND(v_gal_a * v_a_precio, 2), 'A', p_api_id, v_api_correla,
            v_api_manguera, v_api_surtidor, p_usuario, NOW()
        );
        SET p_id_detalle_1 = LAST_INSERT_ID();

        -- Fila 2: el resto, con el mismo numero de vale, contra la siguiente factura.
        INSERT INTO pro_detalle_facturas (
            num_vale, id_factura_vale, id_poliza, id_transportista, id_camion, id_piloto,
            fecha, cantidad, total, origen, id_api_origen, api_correla_num,
            manguera, surtidor, usuario_graba, fecha_hora_graba
        ) VALUES (
            v_api_num_vale, v_b_codigo, p_id_poliza, p_id_transportista, p_id_camion, p_id_piloto,
            DATE(v_api_fecha), v_gal_b, ROUND(v_gal_b * v_b_precio, 2), 'A', p_api_id, v_api_correla,
            v_api_manguera, v_api_surtidor, p_usuario, NOW()
        );
        SET p_id_detalle_2 = LAST_INSERT_ID();

        UPDATE man_facturas_vales
           SET saldo = 0, estado = 'LIQUIDADO'
         WHERE codigo = v_a_codigo
           AND estado = 'ACTIVO'
           AND saldo = v_gal_a;
        IF ROW_COUNT() <> 1 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El saldo de la factura cambio; vuelva a seleccionarla';
        END IF;

        UPDATE man_facturas_vales
           SET saldo = saldo - v_gal_b,
               estado = CASE WHEN saldo - v_gal_b <= 0 THEN 'LIQUIDADO' ELSE 'ACTIVO' END
         WHERE codigo = v_b_codigo
           AND estado = 'ACTIVO'
           AND saldo >= v_gal_b;
        IF ROW_COUNT() <> 1 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El saldo de la segunda factura cambio; vuelva a intentarlo';
        END IF;

        -- El vale del API apunta a la primera fila; la segunda se localiza por id_api_origen.
        SET v_detalle = p_id_detalle_1;
        SET p_hubo_cruce = TRUE;
        SET p_mensaje = CONCAT('Cruce de facturas. ', v_a_factura, ' liquidada con ', v_gal_a,
                               ' gal; el resto (', v_gal_b, ' gal) se cobro a ', v_b_factura, '.');
    END IF;

    -- ---- El vale queda confirmado ---------------------------------------
    UPDATE control_captura_api
       SET api_estado = 'C', api_id_piloto_conf = p_id_piloto,
           api_id_vehiculo_conf = p_id_camion, api_usuario_conf = p_usuario,
           api_fecha_conf = NOW(), api_id_detalle_fact = v_detalle
     WHERE api_id = p_api_id AND api_estado = 'P';
    IF ROW_COUNT() <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El vale ya fue confirmado por otro usuario';
    END IF;

    COMMIT;
END$$

DELIMITER ;
