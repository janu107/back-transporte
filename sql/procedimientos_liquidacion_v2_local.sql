-- ============================================================================
-- PROCEDIMIENTOS DE LIQUIDACIONES V2 PARA DESARROLLO LOCAL
-- MariaDB 10.4 / MySQL 8
--
-- IMPORTANTE: este archivo reemplaza los tres procedimientos. No ejecutarlo en
-- producción si ese motor ya contiene las versiones oficiales de SETRASA.
-- ============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_generar_liquidacion`$$
CREATE PROCEDURE `sp_generar_liquidacion`(
  IN p_id_poliza INT,
  IN p_id_liq_origen INT
)
BEGIN
  DECLARE v_estado VARCHAR(30);
  DECLARE v_id_liquidacion INT;
  DECLARE v_numero VARCHAR(50);
  DECLARE v_suministro DECIMAL(14,4) DEFAULT 0;
  DECLARE v_usuario VARCHAR(50);
  DECLARE v_detalles INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET v_usuario = SUBSTRING_INDEX(CURRENT_USER(), '@', 1);
  START TRANSACTION;

  SET v_estado = NULL;
  SELECT UPPER(estado) INTO v_estado
    FROM man_poliza
   WHERE codigo = p_id_poliza
   FOR UPDATE;
  IF v_estado IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La póliza no existe';
  END IF;
  IF v_estado NOT IN ('CERRADA', 'CERRADA SIN LIQUIDAR') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La póliza debe estar CERRADA para liquidarse';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pro_liquidaciones
     WHERE id_poliza = p_id_poliza AND id_transportista IS NULL
       AND COALESCE(revertida, 0) = 0
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La póliza ya tiene una liquidación activa';
  END IF;
  IF p_id_liq_origen IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pro_liquidaciones
     WHERE correlativo = p_id_liq_origen AND id_poliza = p_id_poliza
       AND COALESCE(revertida, 0) = 1
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La liquidación de origen no corresponde a una reversión de la póliza';
  END IF;

  SELECT COALESCE(MAX(valor_galon_combustible), 0) INTO v_suministro
    FROM con_parametros WHERE codigo = 1;

  INSERT INTO pro_liquidaciones
    (num_liquidacion, id_poliza, id_transportista, estado, revertida,
     id_liq_origen, fecha_liquidacion, usuario_graba)
  VALUES
    (NULL, p_id_poliza, NULL, 'LIQUIDADO', 0,
     p_id_liq_origen, CURDATE(), v_usuario);
  SET v_id_liquidacion = LAST_INSERT_ID();
  SET v_numero = CONCAT('LIQ-', YEAR(CURDATE()), '-', LPAD(v_id_liquidacion, 6, '0'));
  UPDATE pro_liquidaciones SET num_liquidacion = v_numero
   WHERE correlativo = v_id_liquidacion;

  INSERT INTO pro_liquidacion_detalle
    (id_liquidacion, id_transportista, cantidad_viajes, valor_viajes,
     valor_diesel, cantidad_anticipos, valor_anticipos, base_gravable,
     porcentaje_impuesto, valor_impuesto, total_facturar, total_galones,
     suministro, sobregiro_anterior, valor_liquidacion)
  SELECT v_id_liquidacion,
         calc.id_transportista,
         calc.cantidad_viajes,
         ROUND(calc.valor_viajes, 2),
         ROUND(calc.valor_diesel, 2),
         calc.cantidad_anticipos,
         ROUND(calc.valor_anticipos, 2),
         ROUND(calc.base_gravable, 2),
         calc.porcentaje_impuesto,
         ROUND(calc.base_gravable * calc.porcentaje_impuesto / 100, 2),
         ROUND(calc.base_gravable - (calc.base_gravable * calc.porcentaje_impuesto / 100), 2),
         ROUND(calc.total_galones, 2),
         ROUND(calc.total_galones * v_suministro, 2),
         ROUND(calc.sobregiro_anterior, 2),
         ROUND(
           calc.base_gravable - (calc.base_gravable * calc.porcentaje_impuesto / 100)
           - calc.valor_anticipos - (calc.total_galones * v_suministro)
           - calc.sobregiro_anterior,
           2
         )
    FROM (
      SELECT ids.id_transportista,
             COALESCE(v.cantidad_viajes, 0) AS cantidad_viajes,
             COALESCE(v.valor_viajes, 0) AS valor_viajes,
             COALESCE(di.valor_diesel, 0) AS valor_diesel,
             COALESCE(a.cantidad_anticipos, 0) AS cantidad_anticipos,
             COALESCE(a.valor_anticipos, 0) AS valor_anticipos,
             GREATEST(COALESCE(v.valor_viajes, 0) - COALESCE(di.valor_diesel, 0), 0) AS base_gravable,
             COALESCE(t.impuesto, 0) AS porcentaje_impuesto,
             COALESCE(di.total_galones, 0) AS total_galones,
             COALESCE(s.saldo, 0) AS sobregiro_anterior
        FROM (
          SELECT COALESCE(d.id_transportista, c.id_transportista) AS id_transportista
            FROM pro_poliza_detalle d
            LEFT JOIN man_camion c ON c.codigo = d.id_camion
           WHERE d.id_poliza = p_id_poliza AND UPPER(d.estado) <> 'ANULADO'
             AND COALESCE(d.id_transportista, c.id_transportista) IS NOT NULL
          UNION
          SELECT id_transportista FROM pro_anticipo_provision
           WHERE id_poliza = p_id_poliza AND UPPER(estado) IN ('ACTIVO', 'PENDIENTE')
             AND id_transportista IS NOT NULL
          UNION
          SELECT id_transportista FROM pro_detalle_facturas
           WHERE id_poliza = p_id_poliza AND UPPER(estado) IN ('ACTIVO', 'PENDIENTE')
             AND id_transportista IS NOT NULL
        ) ids
        JOIN man_transportista t ON t.codigo = ids.id_transportista
        LEFT JOIN (
          SELECT COALESCE(d.id_transportista, c.id_transportista) AS id_transportista,
                 COUNT(*) AS cantidad_viajes,
                 COALESCE(SUM(d.valor), 0) AS valor_viajes
            FROM pro_poliza_detalle d
            LEFT JOIN man_camion c ON c.codigo = d.id_camion
           WHERE d.id_poliza = p_id_poliza AND UPPER(d.estado) <> 'ANULADO'
           GROUP BY COALESCE(d.id_transportista, c.id_transportista)
        ) v ON v.id_transportista = ids.id_transportista
        LEFT JOIN (
          SELECT d.id_transportista,
                 COALESCE(SUM(d.cantidad), 0) AS total_galones,
                 COALESCE(SUM(COALESCE(d.total, d.cantidad * f.precio, 0)), 0) AS valor_diesel
            FROM pro_detalle_facturas d
            LEFT JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
           WHERE d.id_poliza = p_id_poliza AND UPPER(d.estado) IN ('ACTIVO', 'PENDIENTE')
           GROUP BY d.id_transportista
        ) di ON di.id_transportista = ids.id_transportista
        LEFT JOIN (
          SELECT id_transportista, COUNT(*) AS cantidad_anticipos,
                 COALESCE(SUM(valor), 0) AS valor_anticipos
            FROM pro_anticipo_provision
           WHERE id_poliza = p_id_poliza AND UPPER(estado) IN ('ACTIVO', 'PENDIENTE')
           GROUP BY id_transportista
        ) a ON a.id_transportista = ids.id_transportista
        LEFT JOIN (
          SELECT id_transportista,
                 COALESCE(SUM(valor_sobregiro - valor_abonado), 0) AS saldo
            FROM pro_sobregiro_transportista
           WHERE UPPER(estado) = 'PENDIENTE'
           GROUP BY id_transportista
        ) s ON s.id_transportista = ids.id_transportista
    ) calc;

  SET v_detalles = ROW_COUNT();
  IF v_detalles = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La póliza no tiene movimientos para liquidar';
  END IF;

  UPDATE pro_poliza_detalle
     SET estado = 'LIQUIDADO'
   WHERE id_poliza = p_id_poliza AND UPPER(estado) <> 'ANULADO';
  UPDATE pro_detalle_facturas
     SET estado = 'LIQUIDADO'
   WHERE id_poliza = p_id_poliza AND UPPER(estado) IN ('ACTIVO', 'PENDIENTE');
  UPDATE pro_anticipo_provision
     SET estado = 'LIQUIDADO'
   WHERE id_poliza = p_id_poliza AND UPPER(estado) IN ('ACTIVO', 'PENDIENTE');

  UPDATE pro_sobregiro_transportista s
  JOIN pro_liquidacion_detalle d
    ON d.id_liquidacion = v_id_liquidacion AND d.id_transportista = s.id_transportista
     SET s.estado = 'APLICADO', s.id_poliza_aplica = p_id_poliza,
         s.id_liquidacion_aplica = v_id_liquidacion
   WHERE UPPER(s.estado) = 'PENDIENTE' AND s.valor_sobregiro > s.valor_abonado;

  INSERT INTO pro_sobregiro_transportista
    (id_poliza_origen, id_transportista, valor_sobregiro, valor_abonado,
     id_liquidacion_origen, estado, usuario_graba)
  SELECT p_id_poliza, id_transportista, ABS(valor_liquidacion), 0,
         v_id_liquidacion, 'PENDIENTE', v_usuario
    FROM pro_liquidacion_detalle
   WHERE id_liquidacion = v_id_liquidacion AND valor_liquidacion < 0;

  UPDATE man_poliza
     SET estado = 'LIQUIDADA', fecha_liquidacion = CURDATE()
   WHERE codigo = p_id_poliza;
  COMMIT;

  SELECT v_id_liquidacion AS id_liquidacion, v_numero AS num_liquidacion;
END$$

DROP PROCEDURE IF EXISTS `sp_revertir_liquidacion`$$
CREATE PROCEDURE `sp_revertir_liquidacion`(
  IN p_id_liquidacion INT,
  IN p_usuario VARCHAR(50),
  IN p_motivo VARCHAR(500)
)
BEGIN
  DECLARE v_id_poliza INT DEFAULT NULL;
  DECLARE v_estado VARCHAR(30) DEFAULT NULL;
  DECLARE v_revertida TINYINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF CHAR_LENGTH(TRIM(COALESCE(p_motivo, ''))) < 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El motivo de reversión es obligatorio';
  END IF;
  START TRANSACTION;
  SELECT id_poliza, UPPER(estado), COALESCE(revertida, 0)
    INTO v_id_poliza, v_estado, v_revertida
    FROM pro_liquidaciones
   WHERE correlativo = p_id_liquidacion AND id_transportista IS NULL
   FOR UPDATE;
  IF v_id_poliza IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La liquidación no existe';
  END IF;
  IF v_revertida = 1 OR v_estado = 'REVERTIDA' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La liquidación ya fue revertida';
  END IF;
  IF v_estado <> 'LIQUIDADO' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Solo se puede revertir una liquidación LIQUIDADA';
  END IF;

  UPDATE pro_liquidaciones
     SET estado = 'REVERTIDA', revertida = 1, motivo_reversion = TRIM(p_motivo),
         usuario_reversion = p_usuario, fecha_reversion = NOW()
   WHERE correlativo = p_id_liquidacion;
  UPDATE pro_poliza_detalle SET estado = 'ACTIVO'
   WHERE id_poliza = v_id_poliza AND UPPER(estado) = 'LIQUIDADO';
  UPDATE pro_detalle_facturas SET estado = 'ACTIVO'
   WHERE id_poliza = v_id_poliza AND UPPER(estado) = 'LIQUIDADO';
  UPDATE pro_anticipo_provision SET estado = 'ACTIVO'
   WHERE id_poliza = v_id_poliza AND UPPER(estado) = 'LIQUIDADO';

  UPDATE pro_sobregiro_transportista
     SET estado = 'ANULADO'
   WHERE id_liquidacion_origen = p_id_liquidacion;
  UPDATE pro_sobregiro_transportista
     SET estado = 'PENDIENTE', id_poliza_aplica = NULL, id_liquidacion_aplica = NULL
   WHERE id_liquidacion_aplica = p_id_liquidacion AND valor_sobregiro > valor_abonado;
  UPDATE man_poliza
     SET estado = 'CERRADA', fecha_liquidacion = NULL
   WHERE codigo = v_id_poliza;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS `sp_registrar_abono`$$
CREATE PROCEDURE `sp_registrar_abono`(
  IN p_id_transportista INT,
  IN p_monto DECIMAL(14,2),
  IN p_fecha DATE,
  IN p_forma_pago VARCHAR(50)
)
BEGIN
  DECLARE v_id_sobregiro INT DEFAULT NULL;
  DECLARE v_pendiente DECIMAL(14,2) DEFAULT 0;
  DECLARE v_restante DECIMAL(14,2) DEFAULT 0;
  DECLARE v_aplicar DECIMAL(14,2) DEFAULT 0;
  DECLARE v_saldo DECIMAL(14,2) DEFAULT 0;
  DECLARE v_usuario VARCHAR(50);

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
  SELECT COALESCE(SUM(valor_sobregiro - valor_abonado), 0) INTO v_saldo
    FROM pro_sobregiro_transportista
   WHERE id_transportista = p_id_transportista AND UPPER(estado) = 'PENDIENTE';
  IF p_monto > v_saldo THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El abono excede el saldo pendiente';
  END IF;

  INSERT INTO pro_abonos_transportista
    (id_transportista, fecha, monto, forma_pago, usuario_graba)
  VALUES
    (p_id_transportista, p_fecha, p_monto, TRIM(p_forma_pago), v_usuario);

  SET v_restante = p_monto;
  WHILE v_restante > 0 DO
    SELECT MIN(correlativo) INTO v_id_sobregiro
      FROM pro_sobregiro_transportista
     WHERE id_transportista = p_id_transportista
       AND UPPER(estado) = 'PENDIENTE' AND valor_sobregiro > valor_abonado;
    IF v_id_sobregiro IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No se encontró saldo para aplicar el abono';
    END IF;
    SELECT valor_sobregiro - valor_abonado INTO v_pendiente
      FROM pro_sobregiro_transportista
     WHERE correlativo = v_id_sobregiro
     FOR UPDATE;
    SET v_aplicar = LEAST(v_restante, v_pendiente);
    UPDATE pro_sobregiro_transportista
       SET valor_abonado = valor_abonado + v_aplicar,
           estado = CASE WHEN valor_abonado + v_aplicar >= valor_sobregiro
                         THEN 'CUBIERTO' ELSE 'PENDIENTE' END
     WHERE correlativo = v_id_sobregiro;
    SET v_restante = ROUND(v_restante - v_aplicar, 2);
  END WHILE;
  COMMIT;
END$$

DELIMITER ;
