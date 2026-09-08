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
-- EL SALDO CORRECTO
--   saldo = unidades - (galones ya despachados con vales NO anulados)
--
-- ORDEN DE USO: 1) el paso 1 para ver. 2) el paso 2 para respaldar.
--               3) el paso 3 para corregir. 4) el paso 1 otra vez para revisar.
-- ---------------------------------------------------------------------

-- =====================================================================
-- PASO 1 · VER (no cambia nada). Compara el saldo guardado con el correcto.
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
            ELSE 'revisar a mano' END   AS diagnostico
  FROM man_facturas_vales f
  LEFT JOIN (
        SELECT id_factura_vale, SUM(cantidad) AS despachado
          FROM pro_detalle_facturas
         WHERE UPPER(COALESCE(estado, 'ACTIVO')) NOT IN ('ANULADO', 'ANULADA')
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
--   si se despachó más de lo comprado el saldo queda en 0 y sale en el paso 1
--   como 'revisar a mano'.
-- =====================================================================
UPDATE man_facturas_vales f
  LEFT JOIN (
        SELECT id_factura_vale, SUM(cantidad) AS despachado
          FROM pro_detalle_facturas
         WHERE UPPER(COALESCE(estado, 'ACTIVO')) NOT IN ('ANULADO', 'ANULADA')
         GROUP BY id_factura_vale
       ) d ON d.id_factura_vale = f.codigo
   SET f.saldo = GREATEST(f.unidades - COALESCE(d.despachado, 0), 0)
 WHERE ABS(f.saldo - (f.unidades - COALESCE(d.despachado, 0))) >= 0.01;
