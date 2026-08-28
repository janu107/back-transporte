-- ---------------------------------------------------------------------------
-- revisar_estado_facturas.sql
--
-- «Data truncated for column 'estado'» al guardar una factura de combustible.
-- Ocurre cuando la columna `estado` es un ENUM que NO incluye el valor enviado,
-- sea en la tabla o en su bitácora (el trigger AFTER INSERT copia el estado a
-- Bman_facturas_vales, así que si esa columna es más estrecha el INSERT falla
-- igual aunque la tabla principal sí lo acepte).
--
-- 1) DIAGNÓSTICO: qué acepta cada columna hoy.
-- ---------------------------------------------------------------------------
SELECT TABLE_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND COLUMN_NAME = 'estado'
   AND TABLE_NAME IN ('man_facturas_vales', 'Bman_facturas_vales');

-- Qué estados hay grabados de verdad (útil antes de cambiar el tipo).
SELECT estado, COUNT(*) AS registros
  FROM man_facturas_vales
 GROUP BY estado
 ORDER BY registros DESC;

-- ---------------------------------------------------------------------------
-- 2) OPCIONAL: dejar la columna como el modelo oficial (VARCHAR(20)), de modo
--    que acepte PENDIENTE, PAGADA y ANULADA.
--
--    El sistema YA funciona sin esto: la pantalla ofrece solo los estados que
--    la columna admite. Esto es únicamente si se quiere volver a tener el
--    estado PENDIENTE en las facturas.
--
--    Ejecutar las dos, y en este orden: primero la bitácora, para que el
--    trigger no rechace el valor nuevo.
-- ---------------------------------------------------------------------------
-- ALTER TABLE `Bman_facturas_vales` MODIFY `estado` VARCHAR(20) NULL;
-- ALTER TABLE `man_facturas_vales`  MODIFY `estado` VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE';

-- Comprobación posterior: debe decir varchar(20) en las dos filas.
-- SELECT TABLE_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'estado'
--    AND TABLE_NAME IN ('man_facturas_vales', 'Bman_facturas_vales');
