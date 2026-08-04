-- =====================================================================
--  MIGRACIÓN 2026-08  ·  PORCENTAJE DE PAGOS 6 DECIMALES  ·  SETRASA
--  (item 8) El "Porcentaje de pagos" pasa a ser el FACTOR de la fórmula
--  del valor de envío:  VALOR = peso(kg) × porcentaje_pagos × tarifa.
--  El valor solicitado es 0.022046 (antes estaba hardcodeado en el backend).
--
--  Se amplía la columna a DECIMAL(12,6) en la tabla y en su bitácora sombra
--  (Bcon_parametros) para que el trigger no trunque el valor.
--  MODIFY es idempotente en la práctica (seguro de re-ejecutar).
-- =====================================================================
ALTER TABLE `con_parametros`
  MODIFY COLUMN `porcentaje_pagos` DECIMAL(12,6) DEFAULT NULL;

ALTER TABLE `Bcon_parametros`
  MODIFY COLUMN `porcentaje_pagos` DECIMAL(12,6) DEFAULT NULL;

-- Deja el factor solicitado (0.022046) en la fila única de parámetros.
UPDATE `con_parametros` SET `porcentaje_pagos` = 0.022046 WHERE `codigo` = 1;
