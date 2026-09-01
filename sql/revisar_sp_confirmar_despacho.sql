-- ---------------------------------------------------------------------
-- revisar_sp_confirmar_despacho.sql
--
-- Diagnóstico del procedimiento sp_confirmar_despacho_api.
--
-- CONTEXTO (septiembre 2026)
--   El procedimiento se corrigió para RECIBIR la factura que el usuario elige en
--   pantalla. Su firma pasó de 8 a 9 parámetros de entrada, con el nuevo
--   p_id_factura_vale en la POSICIÓN 8 (después de p_id_poliza y antes de
--   p_usuario):
--
--     1 p_api_id            5 p_id_producto      8 p_id_factura_vale  <-- NUEVO
--     2 p_id_piloto         6 p_id_bomba         9 p_usuario
--     3 p_id_camion         7 p_id_poliza
--     4 p_id_transportista
--
--   Quien llama al procedimiento debe pasar los 9. Con 8 MySQL responde
--   «Incorrect number of arguments», así que el llamador y el procedimiento
--   tienen que ir a la par.
--
-- ATENCIÓN
--   Este archivo SOLO CONSULTA. No modifica el procedimiento: la versión válida
--   es la que ya está aplicada en el servidor. No hay que reemplazarla desde
--   este repositorio, o se perdería la corrección.
-- ---------------------------------------------------------------------

-- 1) ¿Cuántos parámetros de entrada tiene el procedimiento vivo?
--    Debe decir 9. Si dice 8, la corrección del procedimiento no está aplicada.
SELECT COUNT(*) AS parametros_de_entrada
  FROM information_schema.PARAMETERS
 WHERE SPECIFIC_SCHEMA = DATABASE()
   AND SPECIFIC_NAME = 'sp_confirmar_despacho_api'
   AND PARAMETER_MODE = 'IN';

-- 2) El orden exacto: p_id_factura_vale tiene que aparecer en la posición 8.
SELECT ORDINAL_POSITION, PARAMETER_NAME, DATA_TYPE, PARAMETER_MODE
  FROM information_schema.PARAMETERS
 WHERE SPECIFIC_SCHEMA = DATABASE()
   AND SPECIFIC_NAME = 'sp_confirmar_despacho_api'
 ORDER BY ORDINAL_POSITION;

-- 3) Comprobación del resultado: ¿el saldo bajó en la factura elegida?
--    Se corre DESPUÉS de confirmar un vale desde la pantalla. `id_factura_vale`
--    del detalle debe ser el `codigo` de la factura que se eligió.
SELECT d.correlativo, d.num_vale, d.id_api_origen,
       d.id_factura_vale, f.factura, f.saldo AS saldo_actual,
       d.cantidad AS galones, d.total
  FROM pro_detalle_facturas d
  JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
 WHERE d.id_api_origen IS NOT NULL
 ORDER BY d.correlativo DESC
 LIMIT 10;
