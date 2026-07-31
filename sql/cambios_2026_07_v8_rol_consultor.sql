-- =====================================================================
--  MIGRACIÓN 2026-07 (v8)  ·  ROL CONSULTOR
--  Agrega el rol CONSULTOR (solo consulta de catálogos) si no existe.
--  El filtrado de menú por rol se hace en el frontend:
--    ADMIN     -> todo
--    OPERADOR  -> Catálogos + Procesos
--    CONSULTOR -> Catálogos
--  Idempotente.
-- =====================================================================
INSERT INTO `adm_roles` (`tipo_rol`, `descripcion`, `estado`, `usuario_graba`)
SELECT 'CONSULTOR', 'Consultor (solo consulta de catálogos)', 'ACTIVO', 'sistema'
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `adm_roles` WHERE `tipo_rol` = 'CONSULTOR');
