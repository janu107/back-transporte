-- ---------------------------------------------------------------------------
-- revisar_estado_facturas.sql
--
-- «Data truncated for column 'estado'» al guardar una factura de combustible.
--
-- CAUSA CONFIRMADA en producción (agosto 2026): la columna es
--     man_facturas_vales.estado  ENUM('ACTIVO','INACTIVO','LIQUIDADO')
-- y la pantalla ofrecía PENDIENTE / PAGADA / ANULADA, que ese ENUM no admite.
--
-- El ENUM es el CORRECTO: el sistema exige que la factura esté en ACTIVO para
-- poder emitirle vales (ver detalleFactura.service.js). Lo que estaba mal era la
-- lista fija de la pantalla, que ya se corrigió: ahora consulta a la base qué
-- estados admite y ofrece solo esos.
--
-- ESTE ARCHIVO NO HAY QUE EJECUTARLO PARA QUE EL SISTEMA FUNCIONE.
-- Queda como diagnóstico, por si alguna otra tabla presenta lo mismo.
-- ---------------------------------------------------------------------------

-- 1) Qué acepta hoy la columna, en la tabla y en su bitácora. (El trigger AFTER
--    INSERT copia el estado a Bman_facturas_vales, así que si esa columna fuera
--    más estrecha el guardado fallaría igual.)
SELECT TABLE_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND COLUMN_NAME = 'estado'
   AND TABLE_NAME IN ('man_facturas_vales', 'Bman_facturas_vales');

-- 2) Qué estados hay grabados de verdad.
SELECT estado, COUNT(*) AS registros
  FROM man_facturas_vales
 GROUP BY estado
 ORDER BY registros DESC;

-- 3) La misma revisión para TODAS las tablas con columna `estado`: sirve para
--    detectar de antemano otra pantalla que ofrezca valores que su tabla no
--    admite.
SELECT TABLE_NAME, COLUMN_TYPE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND COLUMN_NAME = 'estado'
 ORDER BY TABLE_NAME;
