-- Impide que un vale confirmado desde MATO deje una factura con saldo negativo.
-- La factura se elige en pantalla; si no alcanza, el usuario debe registrar o
-- seleccionar la nueva factura antes de confirmar.
-- Ejecutar una vez en la base de datos de produccion:
--   node scripts/setup-db.js evitar_saldo_negativo_confirmacion.sql

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
    DECLARE v_api_estado CHAR(1);
    DECLARE v_api_correla BIGINT;
    DECLARE v_api_num_vale BIGINT;
    DECLARE v_api_fecha DATETIME;
    DECLARE v_api_galones DECIMAL(16,2);
    DECLARE v_api_manguera INT;
    DECLARE v_api_surtidor INT;
    DECLARE v_fac_saldo DECIMAL(12,2);
    DECLARE v_fac_precio DECIMAL(12,2);
    DECLARE v_fac_numero VARCHAR(50);
    DECLARE v_detalle INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET p_id_detalle_1 = NULL;
    SET p_id_detalle_2 = NULL;
    SET p_hubo_cruce = FALSE;
    SET p_mensaje = '';

    START TRANSACTION;

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

    SELECT saldo, precio, factura
      INTO v_fac_saldo, v_fac_precio, v_fac_numero
      FROM man_facturas_vales
     WHERE codigo = p_id_factura_vale
       AND id_producto = p_id_producto
       AND id_bomba = p_id_bomba
       AND estado = 'ACTIVO'
     FOR UPDATE;

    IF v_fac_numero IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La factura seleccionada no esta activa o no corresponde al producto y bomba';
    END IF;
    IF v_fac_saldo < v_api_galones THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Saldo insuficiente: la factura no puede quedar en negativo. Registre o seleccione una nueva factura.';
    END IF;

    INSERT INTO pro_detalle_facturas (
        num_vale, id_factura_vale, id_poliza, id_transportista, id_camion, id_piloto,
        fecha, cantidad, total, origen, id_api_origen, api_correla_num,
        manguera, surtidor, usuario_graba, fecha_hora_graba
    ) VALUES (
        v_api_num_vale, p_id_factura_vale, p_id_poliza, p_id_transportista, p_id_camion, p_id_piloto,
        DATE(v_api_fecha), v_api_galones, ROUND(v_api_galones * v_fac_precio, 2), 'A', p_api_id, v_api_correla,
        v_api_manguera, v_api_surtidor, p_usuario, NOW()
    );
    SET v_detalle = LAST_INSERT_ID();

    -- La condicion saldo >= galones es una segunda barrera contra saldos negativos.
    UPDATE man_facturas_vales
       SET saldo = saldo - v_api_galones,
           estado = CASE WHEN saldo - v_api_galones = 0 THEN 'LIQUIDADO' ELSE 'ACTIVO' END
     WHERE codigo = p_id_factura_vale
       AND estado = 'ACTIVO'
       AND saldo >= v_api_galones;
    IF ROW_COUNT() <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El saldo de la factura cambio; vuelva a seleccionarla';
    END IF;

    UPDATE control_captura_api
       SET api_estado = 'C', api_id_piloto_conf = p_id_piloto,
           api_id_vehiculo_conf = p_id_camion, api_usuario_conf = p_usuario,
           api_fecha_conf = NOW(), api_id_detalle_fact = v_detalle
     WHERE api_id = p_api_id AND api_estado = 'P';
    IF ROW_COUNT() <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El vale ya fue confirmado por otro usuario';
    END IF;

    COMMIT;
    SET p_id_detalle_1 = v_detalle;
    SET p_mensaje = CONCAT('Despacho confirmado. Se descontaron ', v_api_galones,
                           ' gal de la factura ', v_fac_numero, '.');
END$$

DELIMITER ;
