-- ---------------------------------------------------------------------
-- revisar_sp_confirmar_despacho.sql
--
-- Diagnóstico de la selección manual de factura al confirmar un vale.
--
-- CONTEXTO (septiembre 2026)
--   El procedimiento sp_confirmar_despacho_api se corrigió para RECIBIR la
--   factura que el usuario elige en pantalla. Su firma pasó de 8 a 9 parámetros
--   de entrada, con p_id_factura_vale en la POSICIÓN 8 (después de p_id_poliza
--   y antes de p_usuario).
--
--   La cadena completa es:
--     pantalla  ->  back-transporte  ->  combustible-api  ->  procedimiento
--   Los tres eslabones tienen que pasar la factura. Basta que uno no lo haga
--   para que el cobro siga cayendo en la factura que el procedimiento elegía
--   por su cuenta.
--
-- ATENCIÓN
--   Este archivo SOLO CONSULTA. No modifica el procedimiento: la versión válida
--   es la que ya está en el servidor.
-- ---------------------------------------------------------------------

-- 1) Firma del procedimiento. Debe decir 9.
SELECT COUNT(*) AS parametros_de_entrada
  FROM information_schema.PARAMETERS
 WHERE SPECIFIC_SCHEMA = DATABASE()
   AND SPECIFIC_NAME = 'sp_confirmar_despacho_api'
   AND PARAMETER_MODE = 'IN';

-- 2) El orden: p_id_factura_vale en la posición 8.
SELECT ORDINAL_POSITION, PARAMETER_NAME, DATA_TYPE, PARAMETER_MODE
  FROM information_schema.PARAMETERS
 WHERE SPECIFIC_SCHEMA = DATABASE()
   AND SPECIFIC_NAME = 'sp_confirmar_despacho_api'
 ORDER BY ORDINAL_POSITION;

-- 3) Últimos vales del API, CON FECHA. La fecha es lo que permite separar los
--    vales anteriores al arreglo de los nuevos: solo los grabados DESPUÉS del
--    despliegue sirven para juzgar si ya cobra a la factura elegida.
SELECT d.correlativo, d.num_vale, d.fecha_hora_graba AS grabado,
       d.id_factura_vale, f.factura, d.cantidad AS galones, d.total,
       d.usuario_graba
  FROM pro_detalle_facturas d
  LEFT JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
 WHERE d.id_api_origen IS NOT NULL
 ORDER BY d.correlativo DESC
 LIMIT 15;

-- 4) ¿A cuántas facturas distintas se ha cobrado? Si TODO cae en una sola,
--    la factura elegida no está llegando al procedimiento.
SELECT f.factura, COUNT(*) AS vales,
       SUM(d.cantidad) AS galones, SUM(d.total) AS total,
       MIN(d.fecha_hora_graba) AS primero, MAX(d.fecha_hora_graba) AS ultimo
  FROM pro_detalle_facturas d
  LEFT JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
 WHERE d.id_api_origen IS NOT NULL
 GROUP BY f.factura
 ORDER BY ultimo DESC;

-- 5) Facturas activas con saldo, del producto y bomba que se usan hoy: son las
--    que aparecen en el desplegable. Si hay varias y el cobro siempre cae en la
--    misma, confirma el punto 4.
SELECT codigo, factura, id_producto, id_bomba, precio, saldo, estado
  FROM man_facturas_vales
 WHERE estado = 'ACTIVO' AND saldo > 0
 ORDER BY saldo DESC;

-- ---------------------------------------------------------------------
-- CÓMO VALIDAR QUE YA QUEDÓ (hay que confirmar un vale NUEVO)
--
--   1. Apuntar de la consulta 5 el `codigo` de una factura que NO sea la que
--      aparece en el punto 4 (idealmente la de MAYOR saldo).
--   2. En la pantalla «Confirmar vale», elegir a propósito ESA factura y
--      confirmar un despacho pendiente.
--   3. Volver a correr la consulta 3: la primera fila (la más reciente) debe
--      traer ese `id_factura_vale` y ese número de factura.
--   4. Repetir eligiendo la factura de MENOR saldo, para comprobar que respeta
--      cualquier elección y no solo una.
--
--   Si el vale nuevo sigue cayendo en la factura de siempre, el procedimiento
--   está recibiendo la factura en blanco: revisar que combustible-api pase
--   id_factura_vale como parámetro 8 del CALL.
-- ---------------------------------------------------------------------
