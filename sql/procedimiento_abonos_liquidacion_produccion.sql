-- Compatible con el modelo oficial instalado en producción (MySQL 8).
-- Solo crea el procedimiento que falta; no reemplaza los procedimientos
-- oficiales sp_generar_liquidacion ni sp_revertir_liquidacion.

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_registrar_abono`$$
CREATE PROCEDURE `sp_registrar_abono`(
    IN p_id_transportista INT,
    IN p_monto            DECIMAL(14,2),
    IN p_fecha            DATE,
    IN p_forma_pago       VARCHAR(50)
)
BEGIN
    DECLARE v_id_sobregiro INT DEFAULT NULL;
    DECLARE v_id_poliza    INT DEFAULT NULL;
    DECLARE v_id_abono     INT DEFAULT NULL;
    DECLARE v_pendiente    DECIMAL(14,2) DEFAULT 0;
    DECLARE v_restante     DECIMAL(14,2) DEFAULT 0;
    DECLARE v_aplicar      DECIMAL(14,2) DEFAULT 0;
    DECLARE v_saldo        DECIMAL(14,2) DEFAULT 0;
    DECLARE v_usuario      VARCHAR(50);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_monto IS NULL OR p_monto <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El monto debe ser mayor que cero';
    END IF;
    IF p_fecha IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La fecha es obligatoria';
    END IF;
    IF CHAR_LENGTH(TRIM(COALESCE(p_forma_pago, ''))) = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La forma de pago es obligatoria';
    END IF;

    SET v_usuario = SUBSTRING_INDEX(CURRENT_USER(), '@', 1);
    START TRANSACTION;

    SELECT COALESCE(SUM(saldo_pendiente), 0)
      INTO v_saldo
      FROM pro_sobregiro_transportista
     WHERE id_transportista = p_id_transportista
       AND estado = 'PENDIENTE';

    IF p_monto > v_saldo THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El abono excede el saldo pendiente';
    END IF;

    SET v_restante = p_monto;
    WHILE v_restante > 0 DO
        SET v_id_sobregiro = NULL;
        SELECT MIN(correlativo)
          INTO v_id_sobregiro
          FROM pro_sobregiro_transportista
         WHERE id_transportista = p_id_transportista
           AND estado = 'PENDIENTE'
           AND saldo_pendiente > 0;

        IF v_id_sobregiro IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No se encontró saldo para aplicar el abono';
        END IF;

        SELECT id_poliza_origen, saldo_pendiente
          INTO v_id_poliza, v_pendiente
          FROM pro_sobregiro_transportista
         WHERE correlativo = v_id_sobregiro
         FOR UPDATE;

        SET v_aplicar = LEAST(v_restante, v_pendiente);

        INSERT INTO pro_abonos_transportista
            (id_transportista, id_poliza, monto, descripcion, id_sobregiro,
             estado, usuario_graba, fecha_hora_graba)
        VALUES
            (p_id_transportista, v_id_poliza, v_aplicar, TRIM(p_forma_pago),
             v_id_sobregiro, 'ACTIVO', v_usuario,
             TIMESTAMP(p_fecha, CURRENT_TIME()));

        SET v_id_abono = LAST_INSERT_ID();

        UPDATE pro_sobregiro_transportista
           SET monto_aplicado  = monto_aplicado + v_aplicar,
               saldo_pendiente = GREATEST(saldo_pendiente - v_aplicar, 0),
               estado = CASE
                   WHEN v_pendiente - v_aplicar <= 0 THEN 'ABONADO'
                   ELSE 'PENDIENTE'
               END,
               id_abono = v_id_abono
         WHERE correlativo = v_id_sobregiro;

        SET v_restante = ROUND(v_restante - v_aplicar, 2);
    END WHILE;

    COMMIT;
END$$

DELIMITER ;
