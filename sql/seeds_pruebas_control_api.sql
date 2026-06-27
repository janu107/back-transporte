-- =====================================================================
-- seeds_pruebas_control_api.sql
-- Datos MÍNIMOS de soporte para PROBAR EN LOCAL la pantalla
-- "Control API -> Confirmación de Vales".
--
-- Crea: 1 tipo camión, 1 tipo producto, 1 ubicación (predio), 1 producto,
--       1 bomba, 1 transportista, 1 piloto, 1 camión y 1 factura con saldo.
-- Así los selects del panel "Genera Vale SETRASA" tienen opciones y el
-- botón CONFIRMAR puede ejecutar el SP contra una factura real.
--
-- IDEMPOTENTE (usa WHERE NOT EXISTS). Solo para LOCAL.
-- Ejecutar:  mysql app_transporte < sql/seeds_pruebas_control_api.sql
-- =====================================================================
USE `app_transporte`;

-- Tipo de camión
INSERT INTO `cat_tipo_camion` (`descripcion`,`usuario_graba`)
SELECT 'Cisterna','sistema'
WHERE NOT EXISTS (SELECT 1 FROM `cat_tipo_camion` WHERE `descripcion`='Cisterna');

-- Tipo de producto
INSERT INTO `cat_tipo_producto` (`descripcion`,`usuario_graba`)
SELECT 'Combustible','sistema'
WHERE NOT EXISTS (SELECT 1 FROM `cat_tipo_producto` WHERE `descripcion`='Combustible');

-- Ubicación / predio
INSERT INTO `cat_ubicacion_bomba` (`descripcion`,`direccion`,`encargado`,`usuario_graba`)
SELECT 'PREDIO SETRASA','Km 12 Carretera al Atlántico','Carlos Pérez','sistema'
WHERE NOT EXISTS (SELECT 1 FROM `cat_ubicacion_bomba` WHERE `descripcion`='PREDIO SETRASA');

-- Producto (Diesel) ligado al tipo
INSERT INTO `cat_productos` (`descripcion`,`id_tipo_producto`,`usuario_graba`)
SELECT 'Diesel', (SELECT `codigo` FROM `cat_tipo_producto` WHERE `descripcion`='Combustible' LIMIT 1), 'sistema'
WHERE NOT EXISTS (SELECT 1 FROM `cat_productos` WHERE `descripcion`='Diesel');

-- Bomba (surtidor) en el predio, para el producto Diesel
INSERT INTO `cat_bombas` (`id_ubicacion`,`descripcion`,`mangueras`,`id_producto`,`usuario_graba`)
SELECT
  (SELECT `codigo` FROM `cat_ubicacion_bomba` WHERE `descripcion`='PREDIO SETRASA' LIMIT 1),
  'Bomba 1 - Diesel', 2,
  (SELECT `codigo` FROM `cat_productos` WHERE `descripcion`='Diesel' LIMIT 1),
  'sistema'
WHERE NOT EXISTS (SELECT 1 FROM `cat_bombas` WHERE `descripcion`='Bomba 1 - Diesel');

-- Transportista
INSERT INTO `man_transportista` (`nombre_comercial`,`nit`,`nombres`,`apellidos`,`telefono`,`correo`,`impuesto`,`estado`,`usuario_graba`)
SELECT 'Fletes Rápidos','7654321-0','Mario','García','5555-1111','mario@fletes.com',12.00,'ACTIVO','sistema'
WHERE NOT EXISTS (SELECT 1 FROM `man_transportista` WHERE `nombre_comercial`='Fletes Rápidos');

-- Piloto ligado al transportista
INSERT INTO `man_pilotos` (`nombres`,`apellidos`,`id_transportista`,`licencia`,`tipo_licencia`,`estado`,`usuario_graba`)
SELECT 'Mario','García',
  (SELECT `codigo` FROM `man_transportista` WHERE `nombre_comercial`='Fletes Rápidos' LIMIT 1),
  'LIC-001','A','ACTIVO','sistema'
WHERE NOT EXISTS (SELECT 1 FROM `man_pilotos` WHERE `licencia`='LIC-001');

-- Camión ligado al transportista y al tipo
INSERT INTO `man_camion` (`placa`,`id_transportista`,`id_tipo_camion`,`marca`,`color`,`anio`,`usuario_graba`)
SELECT 'C-100PRU',
  (SELECT `codigo` FROM `man_transportista` WHERE `nombre_comercial`='Fletes Rápidos' LIMIT 1),
  (SELECT `codigo` FROM `cat_tipo_camion` WHERE `descripcion`='Cisterna' LIMIT 1),
  'Kenworth','Blanco',2022,'sistema'
WHERE NOT EXISTS (SELECT 1 FROM `man_camion` WHERE `placa`='C-100PRU');

-- Póliza de prueba (pro_detalle_facturas.id_poliza es NOT NULL en el esquema real,
-- y el SP la exige como parámetro).
INSERT INTO `man_poliza` (`nombre_poliza`,`id_producto`,`fecha`,`descripcion`,`estado`,`usuario_graba`)
SELECT 'POLIZA PRUEBA',
  (SELECT `codigo` FROM `cat_productos` WHERE `descripcion`='Diesel' LIMIT 1),
  CURDATE(), 'Póliza para pruebas', 'ABIERTA', 'sistema'
WHERE NOT EXISTS (SELECT 1 FROM `man_poliza` WHERE `nombre_poliza`='POLIZA PRUEBA');

-- Factura/Vale ACTIVA para Diesel + Bomba 1.
-- IMPORTANTE: el SP real toma la factura con estado='ACTIVO' y saldo < unidades
-- (es decir, parcialmente usada). Por eso saldo (4701.36) < unidades (5000).
INSERT INTO `man_facturas_vales` (`factura`,`id_producto`,`id_bomba`,`descripcion_compra`,`fecha`,`unidades`,`precio`,`saldo`,`estado`,`usuario_graba`)
SELECT 'F-PRUEBA-001',
  (SELECT `codigo` FROM `cat_productos` WHERE `descripcion`='Diesel' LIMIT 1),
  (SELECT `codigo` FROM `cat_bombas` WHERE `descripcion`='Bomba 1 - Diesel' LIMIT 1),
  'Compra de prueba', DATE_SUB(CURDATE(), INTERVAL 2 DAY), 5000.00, 30.15, 4701.36, 'ACTIVO','sistema'
WHERE NOT EXISTS (SELECT 1 FROM `man_facturas_vales` WHERE `factura`='F-PRUEBA-001');

-- Si la factura ya existía con otro estado/saldo, la dejamos lista para el SP:
UPDATE `man_facturas_vales`
   SET `estado`='ACTIVO', `unidades`=5000.00, `saldo`=4701.36, `precio`=30.15
 WHERE `factura`='F-PRUEBA-001';

-- Fin del seed de pruebas.
