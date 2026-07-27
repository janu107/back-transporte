-- =====================================================================
--  MIGRACIÓN 2026-07  ·  TARIFA DE EMBARQUE 5 DECIMALES (P4)  ·  SETRASA
--  Cambia cat_tarifa_embarque.valor a DECIMAL(12,5) sin perder datos.
--  MODIFY es seguro de re-ejecutar (idempotente en la práctica).
-- =====================================================================
ALTER TABLE `cat_tarifa_embarque`
  MODIFY COLUMN `valor` DECIMAL(12,5) DEFAULT NULL;
