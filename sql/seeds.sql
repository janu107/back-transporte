-- =====================================================================
-- seeds.sql
-- Datos iniciales de ejemplo para app_transporte (uso futuro - Fase backend).
-- Ejecutar después de app_transporte.sql.
-- =====================================================================
USE `app_transporte`;

-- Roles
INSERT INTO `adm_roles` (`tipo_rol`, `descripcion`, `estado`) VALUES
  ('ADMIN', 'Administrador del sistema', 'ACTIVO'),
  ('OPERADOR', 'Operador de procesos', 'ACTIVO');

-- Usuario administrador inicial (la contraseña debe almacenarse hasheada).
-- Credenciales sugeridas para pruebas del frontend: admin / Admin123!
INSERT INTO `adm_usuarios` (`usuario`, `nombre`, `correo`, `estado`, `puesto`, `fecha_inicio`, `debe_cambiar_pwd`)
VALUES ('admin', 'Administrador', 'admin@apptransporte.com', 'ACTIVO', 'Administrador', CURDATE(), 0);

INSERT INTO `adm_usuario_rol` (`id_usuario`, `id_rol`, `estado`) VALUES (1, 1, 'ACTIVO');

-- Catálogos base
INSERT INTO `cat_tipo_camion` (`descripcion`) VALUES ('Cisterna'), ('Furgón');
INSERT INTO `cat_tipo_producto` (`descripcion`) VALUES ('Combustible'), ('Carga general');
INSERT INTO `cat_tipo_anticipo_provision` (`descripcion`) VALUES ('Anticipo viático'), ('Provisión combustible');
INSERT INTO `cat_ubicacion_bomba` (`descripcion`, `direccion`, `encargado`) VALUES
  ('Estación Central', 'Km 12 Carretera al Atlántico', 'Carlos Pérez'),
  ('Estación Sur', 'Zona 12, Ciudad', 'Ana López');
INSERT INTO `cat_productos` (`descripcion`, `id_tipo_producto`) VALUES
  ('Diesel', 1), ('Gasolina Súper', 1);
INSERT INTO `cat_bombas` (`id_ubicacion`, `descripcion`, `mangueras`, `id_producto`) VALUES
  (1, 'Bomba 1 - Diesel', 2, 1), (2, 'Bomba 2 - Súper', 3, 2);
INSERT INTO `cat_tarifa_embarque` (`descripcion`, `origen`, `destino`, `valor`, `estado`) VALUES
  ('Ciudad - Puerto', 'Ciudad', 'Puerto Quetzal', 1500.00, 'ACTIVO'),
  ('Ciudad - Frontera', 'Ciudad', 'Tecún Umán', 2200.00, 'ACTIVO');

-- Configuración
INSERT INTO `con_empresas` (`nit`, `nombre`, `direccion`, `telefono`, `correo`, `estado`) VALUES
  ('1234567-8', 'Transportes del Norte S.A.', 'Zona 1, Ciudad', '2222-3333', 'contacto@tnorte.com', 'ACTIVO');
INSERT INTO `con_parametros`
  (`codigo`, `nombre_empresa`, `nit`, `telefono`, `correo`, `iva`, `porcentaje_pagos`, `isr`, `nombre_administrador`)
VALUES (1, 'APP Transporte', '1234567-8', '2222-3333', 'admin@apptransporte.com', 12.00, 5.00, 5.00, 'Administrador');

-- Mantenimientos
INSERT INTO `man_transportista` (`nombre_comercial`, `nit`, `nombres`, `apellidos`, `telefono`, `correo`, `impuesto`, `estado`) VALUES
  ('Fletes Rápidos', '7654321-0', 'Mario', 'García', '5555-1111', 'mario@fletes.com', 12.00, 'ACTIVO'),
  ('Cargas Express', '9988776-5', 'Lucía', 'Méndez', '5555-2222', 'lucia@cargas.com', 12.00, 'ACTIVO');
