-- ---------------------------------------------------------------------
-- corregir_saldo_unidades.sql
--
-- man_facturas_vales.saldo son UNIDADES (galones) por despachar, NO un monto.
--
-- EL PROBLEMA
--   Al crear una factura, la pantalla sugería saldo = unidades × precio. Así una
--   factura de 5,000 galones a Q39.14 nacía con saldo 62,229.33 — un monto, no
--   galones. Los vales sí restan galones (saldo = saldo - cantidad), de modo que
--   el saldo quedaba inflado y una factura parecía tener combustible de sobra.
--
--   La pantalla ya quedó corregida (saldo = unidades al crear). Este archivo
--   arregla las filas VIEJAS.
--
-- LA CUENTA (la del área, tal cual)
--   despachados:
--     SELECT SUM(cantidad) FROM pro_detalle_facturas
--      WHERE id_factura_vale = ? AND estado = 'ACTIVO';
--   saldo:
--     SELECT unidades, saldo, (unidades - <despachados>) AS saldo1
--       FROM man_facturas_vales WHERE factura = ?;
--
--   O sea:  saldo = unidades − SUM(cantidad de los vales ACTIVOS)
--   Solo ACTIVO: un vale anulado devuelve su galonaje y no debe descontar.
--
-- ORDEN DE USO: paso 0 y paso 1 para ver · paso 2 respalda · paso 3 corrige ·
--               paso 1 otra vez para revisar.
-- ---------------------------------------------------------------------

-- =====================================================================
-- PASO 0 · ANTES DE TOCAR NADA: ¿qué estados hay en los vales?
--
--   La cuenta de arriba solo suma los ACTIVO. Si aquí saliera algún estado
--   distinto de ACTIVO / ANULADO / ANULADA — sobre todo NULL, o filas del API
--   (id_api_origen) grabadas por el procedimiento con otro valor —, esos
--   despachos NO se restarían y el saldo quedaría de MÁS.
--
--   Si esta consulta solo muestra ACTIVO y ANULADO, siga tranquilo.
--   Si muestra otra cosa, avise antes de aplicar el paso 3.
--
--   (Si el servidor no tuviera la columna id_api_origen, borre esa línea de la
--    consulta: el resto funciona igual.)
-- =====================================================================
SELECT COALESCE(estado, '(NULL)')            AS estado,
       COUNT(*)                              AS vales,
       SUM(cantidad)                         AS galones,
       SUM(id_api_origen IS NOT NULL)        AS vienen_del_api,
       MIN(fecha)                            AS primero,
       MAX(fecha)                            AS ultimo
  FROM pro_detalle_facturas
 GROUP BY COALESCE(estado, '(NULL)')
 ORDER BY vales DESC;

-- =====================================================================
-- PASO 1 · VER (no cambia nada). Compara el saldo guardado con el de la cuenta.
-- =====================================================================
SELECT f.codigo, f.factura, f.estado,
       f.unidades                       AS compradas_gal,
       f.precio                         AS precio_gal,
       f.saldo                          AS saldo_guardado,
       COALESCE(d.despachado, 0)        AS despachado_gal,
       f.unidades - COALESCE(d.despachado, 0) AS saldo_correcto_gal,
       ROUND(f.saldo - (f.unidades - COALESCE(d.despachado, 0)), 2) AS diferencia,
       -- Si el saldo guardado se parece a unidades × precio, viene del error.
       CASE WHEN ABS(f.saldo - (f.unidades * f.precio)) < 1 THEN 'ERA UN MONTO'
            WHEN ABS(f.saldo - (f.unidades - COALESCE(d.despachado, 0))) < 0.01 THEN 'ya está bien'
            WHEN COALESCE(d.despachado, 0) > f.unidades THEN 'DESPACHADO DE MAS: revisar a mano'
            ELSE 'revisar a mano' END   AS diagnostico
  FROM man_facturas_vales f
  LEFT JOIN (
        SELECT id_factura_vale, SUM(cantidad) AS despachado
          FROM pro_detalle_facturas
         WHERE estado = 'ACTIVO'
         GROUP BY id_factura_vale
       ) d ON d.id_factura_vale = f.codigo
 ORDER BY ABS(f.saldo - (f.unidades - COALESCE(d.despachado, 0))) DESC;

-- =====================================================================
-- PASO 2 · RESPALDO de los saldos actuales, para poder volver atrás.
-- =====================================================================
DROP TABLE IF EXISTS respaldo_saldo_facturas_2026_09;
CREATE TABLE respaldo_saldo_facturas_2026_09 AS
  SELECT codigo, factura, unidades, precio, saldo, estado, NOW() AS respaldado
    FROM man_facturas_vales;

-- Para deshacer la corrección:
--   UPDATE man_facturas_vales f
--     JOIN respaldo_saldo_facturas_2026_09 r ON r.codigo = f.codigo
--      SET f.saldo = r.saldo;

-- =====================================================================
-- PASO 3 · CORREGIR. Deja el saldo en galones por despachar.
--   Solo toca las facturas que NO están ya correctas, y nunca deja negativo:
--   si se despachó más de lo comprado el saldo queda en 0 y esa factura sale
--   en el paso 1 como 'DESPACHADO DE MAS: revisar a mano'.
-- =====================================================================
UPDATE man_facturas_vales f
  LEFT JOIN (
        SELECT id_factura_vale, SUM(cantidad) AS despachado
          FROM pro_detalle_facturas
         WHERE estado = 'ACTIVO'
         GROUP BY id_factura_vale
       ) d ON d.id_factura_vale = f.codigo
   SET f.saldo = GREATEST(f.unidades - COALESCE(d.despachado, 0), 0)
 WHERE ABS(f.saldo - (f.unidades - COALESCE(d.despachado, 0))) >= 0.01;
