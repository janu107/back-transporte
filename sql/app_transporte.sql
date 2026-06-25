-- =====================================================================
-- app_transporte.sql  — Esquema completo (MySQL 8 / MariaDB 10.4)
-- Sistema Administrativo de Transporte (SETRASA)
--
-- Incluye: tablas principales + tablas de bitácora (B*) + triggers de auditoría.
-- La auditoría es AUTOMÁTICA: cada INSERT/UPDATE/DELETE en una tabla principal
-- registra una fila en su tabla B* mediante triggers. El backend solo debe
-- escribir la columna `usuario_graba` con el usuario en sesión.
--
-- IMPORTANTE: si tu base de datos quedó corrupta (#1932 doesn't exist in engine),
-- ejecuta este script completo para recrearla desde cero.
-- =====================================================================

DROP DATABASE IF EXISTS `app_transporte`;
CREATE DATABASE `app_transporte` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `app_transporte`;

SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
--  SEGURIDAD
-- =====================================================================
CREATE TABLE `adm_roles` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `tipo_rol` VARCHAR(50) NOT NULL,
  `descripcion` VARCHAR(150) DEFAULT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`),
  UNIQUE KEY `uq_roles_tipo` (`tipo_rol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `adm_usuarios` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `usuario` VARCHAR(50) NOT NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `correo` VARCHAR(150) DEFAULT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
  `puesto` VARCHAR(100) DEFAULT NULL,
  `fecha_inicio` DATE DEFAULT NULL,
  `contrasena` VARCHAR(255) DEFAULT NULL,
  `ultimo_login` DATETIME DEFAULT NULL,
  `intentos_fallidos` TINYINT DEFAULT 0,
  `bloqueado_hasta` DATETIME DEFAULT NULL,
  `debe_cambiar_pwd` TINYINT(1) DEFAULT 0,
  `fecha_cambio_pwd` DATETIME DEFAULT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`),
  UNIQUE KEY `uq_usuarios_usuario` (`usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `adm_usuario_rol` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `id_usuario` INT NOT NULL,
  `id_rol` INT NOT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`),
  KEY `fk_ur_usuario` (`id_usuario`),
  KEY `fk_ur_rol` (`id_rol`),
  CONSTRAINT `fk_ur_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `adm_usuarios` (`codigo`),
  CONSTRAINT `fk_ur_rol` FOREIGN KEY (`id_rol`) REFERENCES `adm_roles` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  CATÁLOGOS
-- =====================================================================
CREATE TABLE `cat_tipo_camion` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(150) NOT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cat_tipo_producto` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(150) NOT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cat_tipo_anticipo_provision` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(150) NOT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cat_ubicacion_bomba` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(150) NOT NULL,
  `direccion` VARCHAR(250) DEFAULT NULL,
  `encargado` VARCHAR(150) DEFAULT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cat_productos` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(150) NOT NULL,
  `id_tipo_producto` INT DEFAULT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`),
  KEY `fk_prod_tipo` (`id_tipo_producto`),
  CONSTRAINT `fk_prod_tipo` FOREIGN KEY (`id_tipo_producto`) REFERENCES `cat_tipo_producto` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cat_bombas` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `id_ubicacion` INT DEFAULT NULL,
  `descripcion` VARCHAR(150) NOT NULL,
  `mangueras` INT DEFAULT NULL,
  `id_producto` INT DEFAULT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`),
  KEY `fk_bomba_ubic` (`id_ubicacion`),
  KEY `fk_bomba_prod` (`id_producto`),
  CONSTRAINT `fk_bomba_ubic` FOREIGN KEY (`id_ubicacion`) REFERENCES `cat_ubicacion_bomba` (`codigo`),
  CONSTRAINT `fk_bomba_prod` FOREIGN KEY (`id_producto`) REFERENCES `cat_productos` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cat_tarifa_embarque` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(150) NOT NULL,
  `origen` VARCHAR(150) DEFAULT NULL,
  `destino` VARCHAR(150) DEFAULT NULL,
  `valor` DECIMAL(12,2) DEFAULT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  CONFIGURACIÓN
-- =====================================================================
CREATE TABLE `con_empresas` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `nit` VARCHAR(20) DEFAULT NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `direccion` VARCHAR(250) DEFAULT NULL,
  `telefono` VARCHAR(20) DEFAULT NULL,
  `correo` VARCHAR(150) DEFAULT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `con_parametros` (
  `codigo` TINYINT NOT NULL DEFAULT 1,
  `nombre_empresa` VARCHAR(150) DEFAULT NULL,
  `nit` VARCHAR(20) DEFAULT NULL,
  `telefono` VARCHAR(20) DEFAULT NULL,
  `correo` VARCHAR(150) DEFAULT NULL,
  `iva` DECIMAL(5,2) DEFAULT NULL,
  `porcentaje_pagos` DECIMAL(5,2) DEFAULT NULL,
  `isr` DECIMAL(5,2) DEFAULT NULL,
  `nombre_administrador` VARCHAR(150) DEFAULT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  MANTENIMIENTOS
-- =====================================================================
CREATE TABLE `man_transportista` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `nombre_comercial` VARCHAR(150) DEFAULT NULL,
  `nit` VARCHAR(20) DEFAULT NULL,
  `nombres` VARCHAR(150) DEFAULT NULL,
  `apellidos` VARCHAR(150) DEFAULT NULL,
  `direccion` VARCHAR(250) DEFAULT NULL,
  `telefono` VARCHAR(20) DEFAULT NULL,
  `correo` VARCHAR(150) DEFAULT NULL,
  `impuesto` DECIMAL(5,2) DEFAULT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `man_pilotos` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `nombres` VARCHAR(150) NOT NULL,
  `apellidos` VARCHAR(150) DEFAULT NULL,
  `id_transportista` INT DEFAULT NULL,
  `licencia` VARCHAR(50) DEFAULT NULL,
  `tipo_licencia` VARCHAR(20) DEFAULT NULL,
  `fecha_vigencia` DATE DEFAULT NULL,
  `direccion` VARCHAR(250) DEFAULT NULL,
  `telefono` VARCHAR(20) DEFAULT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`),
  KEY `fk_piloto_transp` (`id_transportista`),
  CONSTRAINT `fk_piloto_transp` FOREIGN KEY (`id_transportista`) REFERENCES `man_transportista` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `man_camion` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `placa` VARCHAR(15) NOT NULL,
  `id_transportista` INT DEFAULT NULL,
  `id_tipo_camion` INT DEFAULT NULL,
  `marca` VARCHAR(80) DEFAULT NULL,
  `color` VARCHAR(50) DEFAULT NULL,
  `anio` YEAR DEFAULT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`),
  KEY `fk_camion_transp` (`id_transportista`),
  KEY `fk_camion_tipo` (`id_tipo_camion`),
  CONSTRAINT `fk_camion_transp` FOREIGN KEY (`id_transportista`) REFERENCES `man_transportista` (`codigo`),
  CONSTRAINT `fk_camion_tipo` FOREIGN KEY (`id_tipo_camion`) REFERENCES `cat_tipo_camion` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `man_poliza` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `nombre_poliza` VARCHAR(150) DEFAULT NULL,
  `id_empresa` INT DEFAULT NULL,
  `id_producto` INT DEFAULT NULL,
  `fecha` DATE DEFAULT NULL,
  `fecha_liquidacion` DATE DEFAULT NULL,
  `descripcion` VARCHAR(250) DEFAULT NULL,
  `cantidad_bultos` INT DEFAULT NULL,
  `cantidad_piezas` INT DEFAULT NULL,
  `peso_quintales` DECIMAL(12,2) DEFAULT NULL,
  `peso_kilogramos` DECIMAL(12,2) DEFAULT NULL,
  `peso_total` DECIMAL(12,2) DEFAULT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'ABIERTA',
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`),
  KEY `fk_poliza_empresa` (`id_empresa`),
  KEY `fk_poliza_producto` (`id_producto`),
  CONSTRAINT `fk_poliza_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `con_empresas` (`codigo`),
  CONSTRAINT `fk_poliza_producto` FOREIGN KEY (`id_producto`) REFERENCES `cat_productos` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `man_facturas_vales` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `factura` VARCHAR(50) DEFAULT NULL,
  `id_producto` INT DEFAULT NULL,
  `id_bomba` INT DEFAULT NULL,
  `descripcion_compra` VARCHAR(250) DEFAULT NULL,
  `fecha` DATE DEFAULT NULL,
  `unidades` DECIMAL(12,2) DEFAULT NULL,
  `precio` DECIMAL(12,2) DEFAULT NULL,
  `saldo` DECIMAL(12,2) DEFAULT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`),
  KEY `fk_fv_producto` (`id_producto`),
  KEY `fk_fv_bomba` (`id_bomba`),
  CONSTRAINT `fk_fv_producto` FOREIGN KEY (`id_producto`) REFERENCES `cat_productos` (`codigo`),
  CONSTRAINT `fk_fv_bomba` FOREIGN KEY (`id_bomba`) REFERENCES `cat_bombas` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  PROCESOS
-- =====================================================================
CREATE TABLE `pro_poliza_detalle` (
  `correlativo` INT NOT NULL AUTO_INCREMENT,
  `num_envio` VARCHAR(50) DEFAULT NULL,
  `id_poliza` INT DEFAULT NULL,
  `id_transportista` INT DEFAULT NULL,
  `id_camion` INT DEFAULT NULL,
  `id_piloto` INT DEFAULT NULL,
  `id_tarifa_embarque` INT DEFAULT NULL,
  `fecha` DATE DEFAULT NULL,
  `tipo` VARCHAR(50) DEFAULT NULL,
  `cantidad_bultos_piezas` INT DEFAULT NULL,
  `peso` DECIMAL(12,2) DEFAULT NULL,
  `valor` DECIMAL(12,2) DEFAULT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  `observaciones` VARCHAR(250) DEFAULT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`correlativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pro_anticipo_provision` (
  `correlativo` INT NOT NULL AUTO_INCREMENT,
  `num_anticipo` VARCHAR(50) DEFAULT NULL,
  `id_poliza` INT DEFAULT NULL,
  `id_transportista` INT DEFAULT NULL,
  `id_camion` INT DEFAULT NULL,
  `id_piloto` INT DEFAULT NULL,
  `id_tipo_anticipo_provision` INT DEFAULT NULL,
  `fecha` DATE DEFAULT NULL,
  `valor` DECIMAL(12,2) DEFAULT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  `descripcion` VARCHAR(250) DEFAULT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`correlativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pro_detalle_facturas` (
  `correlativo` INT NOT NULL AUTO_INCREMENT,
  `num_vale` VARCHAR(50) DEFAULT NULL,
  `id_factura_vale` INT DEFAULT NULL,
  `id_poliza` INT DEFAULT NULL,
  `id_transportista` INT DEFAULT NULL,
  `id_camion` INT DEFAULT NULL,
  `id_piloto` INT DEFAULT NULL,
  `fecha` DATE DEFAULT NULL,
  `cantidad` DECIMAL(12,2) DEFAULT NULL,
  `total` DECIMAL(12,2) DEFAULT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`correlativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pro_liquidaciones` (
  `correlativo` INT NOT NULL AUTO_INCREMENT,
  `num_liquidacion` VARCHAR(50) DEFAULT NULL,
  `id_poliza` INT DEFAULT NULL,
  `id_transportista` INT DEFAULT NULL,
  `cantidad_viajes` INT DEFAULT NULL,
  `valor_viajes` DECIMAL(12,2) DEFAULT NULL,
  `cantidad_vale` INT DEFAULT NULL,
  `valor_vales` DECIMAL(12,2) DEFAULT NULL,
  `cantidad_anticipos` INT DEFAULT NULL,
  `valor_anticipos` DECIMAL(12,2) DEFAULT NULL,
  `valor_liquidacion` DECIMAL(12,2) DEFAULT NULL,
  `estado` VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  `fecha_liquidacion` DATE DEFAULT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`correlativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  TABLAS DE BITÁCORA (auditoría)  — se llenan por triggers
-- =====================================================================
CREATE TABLE `Badm_roles` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `tipo_rol` VARCHAR(50), `descripcion` VARCHAR(150), `estado` VARCHAR(20),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Badm_usuarios` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `usuario` VARCHAR(50), `nombre` VARCHAR(150), `correo` VARCHAR(150), `estado` VARCHAR(20),
  `puesto` VARCHAR(100), `fecha_inicio` DATE, `contrasena` VARCHAR(255), `ultimo_login` DATETIME,
  `intentos_fallidos` TINYINT, `bloqueado_hasta` DATETIME, `debe_cambiar_pwd` TINYINT(1), `fecha_cambio_pwd` DATETIME,
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Badm_usuario_rol` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `id_usuario` INT, `id_rol` INT, `estado` VARCHAR(20),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bcat_tipo_camion` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `descripcion` VARCHAR(150),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bcat_tipo_producto` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `descripcion` VARCHAR(150),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bcat_tipo_anticipo_provision` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `descripcion` VARCHAR(150),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bcat_ubicacion_bomba` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `descripcion` VARCHAR(150), `direccion` VARCHAR(250), `encargado` VARCHAR(150),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bcat_productos` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `descripcion` VARCHAR(150), `id_tipo_producto` INT,
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bcat_bombas` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `id_ubicacion` INT, `descripcion` VARCHAR(150), `mangueras` INT, `id_producto` INT,
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bcat_tarifa_embarque` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `descripcion` VARCHAR(150), `origen` VARCHAR(150), `destino` VARCHAR(150), `valor` DECIMAL(12,2), `estado` VARCHAR(20),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bcon_empresas` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `nit` VARCHAR(20), `nombre` VARCHAR(150), `direccion` VARCHAR(250), `telefono` VARCHAR(20), `correo` VARCHAR(150), `estado` VARCHAR(20),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bcon_parametros` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` TINYINT, `nombre_empresa` VARCHAR(150), `nit` VARCHAR(20), `telefono` VARCHAR(20), `correo` VARCHAR(150),
  `iva` DECIMAL(5,2), `porcentaje_pagos` DECIMAL(5,2), `isr` DECIMAL(5,2), `nombre_administrador` VARCHAR(150),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bman_transportista` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `nombre_comercial` VARCHAR(150), `nit` VARCHAR(20), `nombres` VARCHAR(150), `apellidos` VARCHAR(150),
  `direccion` VARCHAR(250), `telefono` VARCHAR(20), `correo` VARCHAR(150), `impuesto` DECIMAL(5,2), `estado` VARCHAR(20),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bman_pilotos` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `nombres` VARCHAR(150), `apellidos` VARCHAR(150), `id_transportista` INT, `licencia` VARCHAR(50),
  `tipo_licencia` VARCHAR(20), `fecha_vigencia` DATE, `direccion` VARCHAR(250), `telefono` VARCHAR(20), `estado` VARCHAR(20),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bman_camion` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `placa` VARCHAR(15), `id_transportista` INT, `id_tipo_camion` INT, `marca` VARCHAR(80), `color` VARCHAR(50), `anio` YEAR,
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bman_poliza` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `nombre_poliza` VARCHAR(150), `id_empresa` INT, `id_producto` INT, `fecha` DATE, `fecha_liquidacion` DATE,
  `descripcion` VARCHAR(250), `cantidad_bultos` INT, `cantidad_piezas` INT, `peso_quintales` DECIMAL(12,2),
  `peso_kilogramos` DECIMAL(12,2), `peso_total` DECIMAL(12,2), `estado` VARCHAR(20),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bman_facturas_vales` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT, `factura` VARCHAR(50), `id_producto` INT, `id_bomba` INT, `descripcion_compra` VARCHAR(250),
  `fecha` DATE, `unidades` DECIMAL(12,2), `precio` DECIMAL(12,2), `saldo` DECIMAL(12,2), `estado` VARCHAR(20),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bpro_poliza_detalle` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `correlativo` INT, `num_envio` VARCHAR(50), `id_poliza` INT, `id_transportista` INT, `id_camion` INT, `id_piloto` INT,
  `id_tarifa_embarque` INT, `fecha` DATE, `tipo` VARCHAR(50), `cantidad_bultos_piezas` INT, `peso` DECIMAL(12,2),
  `valor` DECIMAL(12,2), `estado` VARCHAR(20), `observaciones` VARCHAR(250),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bpro_anticipo_provision` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `correlativo` INT, `num_anticipo` VARCHAR(50), `id_poliza` INT, `id_transportista` INT, `id_camion` INT, `id_piloto` INT,
  `id_tipo_anticipo_provision` INT, `fecha` DATE, `valor` DECIMAL(12,2), `estado` VARCHAR(20), `descripcion` VARCHAR(250),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bpro_detalle_facturas` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `correlativo` INT, `num_vale` VARCHAR(50), `id_factura_vale` INT, `id_poliza` INT, `id_transportista` INT,
  `id_camion` INT, `id_piloto` INT, `fecha` DATE, `cantidad` DECIMAL(12,2), `total` DECIMAL(12,2),
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Bpro_liquidaciones` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT, `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `correlativo` INT, `num_liquidacion` VARCHAR(50), `id_poliza` INT, `id_transportista` INT, `cantidad_viajes` INT,
  `valor_viajes` DECIMAL(12,2), `cantidad_vale` INT, `valor_vales` DECIMAL(12,2), `cantidad_anticipos` INT,
  `valor_anticipos` DECIMAL(12,2), `valor_liquidacion` DECIMAL(12,2), `estado` VARCHAR(20), `fecha_liquidacion` DATE,
  `usuario_graba` VARCHAR(50), `fecha_hora_graba` DATETIME, `usuario_accion` VARCHAR(50),
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
--  TRIGGERS DE AUDITORÍA
-- =====================================================================
DELIMITER $$

-- adm_roles
CREATE TRIGGER `tg_adm_roles_ai` AFTER INSERT ON `adm_roles` FOR EACH ROW BEGIN
  INSERT INTO Badm_roles (operacion,codigo,tipo_rol,descripcion,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.tipo_rol,NEW.descripcion,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_adm_roles_au` AFTER UPDATE ON `adm_roles` FOR EACH ROW BEGIN
  INSERT INTO Badm_roles (operacion,codigo,tipo_rol,descripcion,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.tipo_rol,NEW.descripcion,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_adm_roles_ad` AFTER DELETE ON `adm_roles` FOR EACH ROW BEGIN
  INSERT INTO Badm_roles (operacion,codigo,tipo_rol,descripcion,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.tipo_rol,OLD.descripcion,OLD.estado,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- adm_usuarios
CREATE TRIGGER `tg_adm_usuarios_ai` AFTER INSERT ON `adm_usuarios` FOR EACH ROW BEGIN
  INSERT INTO Badm_usuarios (operacion,codigo,usuario,nombre,correo,estado,puesto,fecha_inicio,contrasena,ultimo_login,intentos_fallidos,bloqueado_hasta,debe_cambiar_pwd,fecha_cambio_pwd,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.usuario,NEW.nombre,NEW.correo,NEW.estado,NEW.puesto,NEW.fecha_inicio,NEW.contrasena,NEW.ultimo_login,NEW.intentos_fallidos,NEW.bloqueado_hasta,NEW.debe_cambiar_pwd,NEW.fecha_cambio_pwd,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_adm_usuarios_au` AFTER UPDATE ON `adm_usuarios` FOR EACH ROW BEGIN
  INSERT INTO Badm_usuarios (operacion,codigo,usuario,nombre,correo,estado,puesto,fecha_inicio,contrasena,ultimo_login,intentos_fallidos,bloqueado_hasta,debe_cambiar_pwd,fecha_cambio_pwd,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.usuario,NEW.nombre,NEW.correo,NEW.estado,NEW.puesto,NEW.fecha_inicio,NEW.contrasena,NEW.ultimo_login,NEW.intentos_fallidos,NEW.bloqueado_hasta,NEW.debe_cambiar_pwd,NEW.fecha_cambio_pwd,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_adm_usuarios_ad` AFTER DELETE ON `adm_usuarios` FOR EACH ROW BEGIN
  INSERT INTO Badm_usuarios (operacion,codigo,usuario,nombre,correo,estado,puesto,fecha_inicio,contrasena,ultimo_login,intentos_fallidos,bloqueado_hasta,debe_cambiar_pwd,fecha_cambio_pwd,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.usuario,OLD.nombre,OLD.correo,OLD.estado,OLD.puesto,OLD.fecha_inicio,OLD.contrasena,OLD.ultimo_login,OLD.intentos_fallidos,OLD.bloqueado_hasta,OLD.debe_cambiar_pwd,OLD.fecha_cambio_pwd,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- adm_usuario_rol
CREATE TRIGGER `tg_adm_usuario_rol_ai` AFTER INSERT ON `adm_usuario_rol` FOR EACH ROW BEGIN
  INSERT INTO Badm_usuario_rol (operacion,codigo,id_usuario,id_rol,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.id_usuario,NEW.id_rol,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_adm_usuario_rol_au` AFTER UPDATE ON `adm_usuario_rol` FOR EACH ROW BEGIN
  INSERT INTO Badm_usuario_rol (operacion,codigo,id_usuario,id_rol,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.id_usuario,NEW.id_rol,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_adm_usuario_rol_ad` AFTER DELETE ON `adm_usuario_rol` FOR EACH ROW BEGIN
  INSERT INTO Badm_usuario_rol (operacion,codigo,id_usuario,id_rol,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.id_usuario,OLD.id_rol,OLD.estado,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- cat_tipo_camion
CREATE TRIGGER `tg_cat_tipo_camion_ai` AFTER INSERT ON `cat_tipo_camion` FOR EACH ROW BEGIN
  INSERT INTO Bcat_tipo_camion (operacion,codigo,descripcion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.descripcion,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_tipo_camion_au` AFTER UPDATE ON `cat_tipo_camion` FOR EACH ROW BEGIN
  INSERT INTO Bcat_tipo_camion (operacion,codigo,descripcion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.descripcion,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_tipo_camion_ad` AFTER DELETE ON `cat_tipo_camion` FOR EACH ROW BEGIN
  INSERT INTO Bcat_tipo_camion (operacion,codigo,descripcion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.descripcion,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- cat_tipo_producto
CREATE TRIGGER `tg_cat_tipo_producto_ai` AFTER INSERT ON `cat_tipo_producto` FOR EACH ROW BEGIN
  INSERT INTO Bcat_tipo_producto (operacion,codigo,descripcion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.descripcion,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_tipo_producto_au` AFTER UPDATE ON `cat_tipo_producto` FOR EACH ROW BEGIN
  INSERT INTO Bcat_tipo_producto (operacion,codigo,descripcion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.descripcion,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_tipo_producto_ad` AFTER DELETE ON `cat_tipo_producto` FOR EACH ROW BEGIN
  INSERT INTO Bcat_tipo_producto (operacion,codigo,descripcion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.descripcion,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- cat_tipo_anticipo_provision
CREATE TRIGGER `tg_cat_tipo_ap_ai` AFTER INSERT ON `cat_tipo_anticipo_provision` FOR EACH ROW BEGIN
  INSERT INTO Bcat_tipo_anticipo_provision (operacion,codigo,descripcion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.descripcion,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_tipo_ap_au` AFTER UPDATE ON `cat_tipo_anticipo_provision` FOR EACH ROW BEGIN
  INSERT INTO Bcat_tipo_anticipo_provision (operacion,codigo,descripcion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.descripcion,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_tipo_ap_ad` AFTER DELETE ON `cat_tipo_anticipo_provision` FOR EACH ROW BEGIN
  INSERT INTO Bcat_tipo_anticipo_provision (operacion,codigo,descripcion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.descripcion,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- cat_ubicacion_bomba
CREATE TRIGGER `tg_cat_ubic_ai` AFTER INSERT ON `cat_ubicacion_bomba` FOR EACH ROW BEGIN
  INSERT INTO Bcat_ubicacion_bomba (operacion,codigo,descripcion,direccion,encargado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.descripcion,NEW.direccion,NEW.encargado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_ubic_au` AFTER UPDATE ON `cat_ubicacion_bomba` FOR EACH ROW BEGIN
  INSERT INTO Bcat_ubicacion_bomba (operacion,codigo,descripcion,direccion,encargado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.descripcion,NEW.direccion,NEW.encargado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_ubic_ad` AFTER DELETE ON `cat_ubicacion_bomba` FOR EACH ROW BEGIN
  INSERT INTO Bcat_ubicacion_bomba (operacion,codigo,descripcion,direccion,encargado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.descripcion,OLD.direccion,OLD.encargado,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- cat_productos
CREATE TRIGGER `tg_cat_productos_ai` AFTER INSERT ON `cat_productos` FOR EACH ROW BEGIN
  INSERT INTO Bcat_productos (operacion,codigo,descripcion,id_tipo_producto,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.descripcion,NEW.id_tipo_producto,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_productos_au` AFTER UPDATE ON `cat_productos` FOR EACH ROW BEGIN
  INSERT INTO Bcat_productos (operacion,codigo,descripcion,id_tipo_producto,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.descripcion,NEW.id_tipo_producto,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_productos_ad` AFTER DELETE ON `cat_productos` FOR EACH ROW BEGIN
  INSERT INTO Bcat_productos (operacion,codigo,descripcion,id_tipo_producto,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.descripcion,OLD.id_tipo_producto,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- cat_bombas
CREATE TRIGGER `tg_cat_bombas_ai` AFTER INSERT ON `cat_bombas` FOR EACH ROW BEGIN
  INSERT INTO Bcat_bombas (operacion,codigo,id_ubicacion,descripcion,mangueras,id_producto,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.id_ubicacion,NEW.descripcion,NEW.mangueras,NEW.id_producto,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_bombas_au` AFTER UPDATE ON `cat_bombas` FOR EACH ROW BEGIN
  INSERT INTO Bcat_bombas (operacion,codigo,id_ubicacion,descripcion,mangueras,id_producto,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.id_ubicacion,NEW.descripcion,NEW.mangueras,NEW.id_producto,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_bombas_ad` AFTER DELETE ON `cat_bombas` FOR EACH ROW BEGIN
  INSERT INTO Bcat_bombas (operacion,codigo,id_ubicacion,descripcion,mangueras,id_producto,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.id_ubicacion,OLD.descripcion,OLD.mangueras,OLD.id_producto,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- cat_tarifa_embarque
CREATE TRIGGER `tg_cat_tarifa_ai` AFTER INSERT ON `cat_tarifa_embarque` FOR EACH ROW BEGIN
  INSERT INTO Bcat_tarifa_embarque (operacion,codigo,descripcion,origen,destino,valor,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.descripcion,NEW.origen,NEW.destino,NEW.valor,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_tarifa_au` AFTER UPDATE ON `cat_tarifa_embarque` FOR EACH ROW BEGIN
  INSERT INTO Bcat_tarifa_embarque (operacion,codigo,descripcion,origen,destino,valor,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.descripcion,NEW.origen,NEW.destino,NEW.valor,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_cat_tarifa_ad` AFTER DELETE ON `cat_tarifa_embarque` FOR EACH ROW BEGIN
  INSERT INTO Bcat_tarifa_embarque (operacion,codigo,descripcion,origen,destino,valor,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.descripcion,OLD.origen,OLD.destino,OLD.valor,OLD.estado,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- con_empresas
CREATE TRIGGER `tg_con_empresas_ai` AFTER INSERT ON `con_empresas` FOR EACH ROW BEGIN
  INSERT INTO Bcon_empresas (operacion,codigo,nit,nombre,direccion,telefono,correo,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.nit,NEW.nombre,NEW.direccion,NEW.telefono,NEW.correo,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_con_empresas_au` AFTER UPDATE ON `con_empresas` FOR EACH ROW BEGIN
  INSERT INTO Bcon_empresas (operacion,codigo,nit,nombre,direccion,telefono,correo,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.nit,NEW.nombre,NEW.direccion,NEW.telefono,NEW.correo,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_con_empresas_ad` AFTER DELETE ON `con_empresas` FOR EACH ROW BEGIN
  INSERT INTO Bcon_empresas (operacion,codigo,nit,nombre,direccion,telefono,correo,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.nit,OLD.nombre,OLD.direccion,OLD.telefono,OLD.correo,OLD.estado,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- con_parametros
CREATE TRIGGER `tg_con_parametros_ai` AFTER INSERT ON `con_parametros` FOR EACH ROW BEGIN
  INSERT INTO Bcon_parametros (operacion,codigo,nombre_empresa,nit,telefono,correo,iva,porcentaje_pagos,isr,nombre_administrador,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.nombre_empresa,NEW.nit,NEW.telefono,NEW.correo,NEW.iva,NEW.porcentaje_pagos,NEW.isr,NEW.nombre_administrador,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_con_parametros_au` AFTER UPDATE ON `con_parametros` FOR EACH ROW BEGIN
  INSERT INTO Bcon_parametros (operacion,codigo,nombre_empresa,nit,telefono,correo,iva,porcentaje_pagos,isr,nombre_administrador,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.nombre_empresa,NEW.nit,NEW.telefono,NEW.correo,NEW.iva,NEW.porcentaje_pagos,NEW.isr,NEW.nombre_administrador,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_con_parametros_ad` AFTER DELETE ON `con_parametros` FOR EACH ROW BEGIN
  INSERT INTO Bcon_parametros (operacion,codigo,nombre_empresa,nit,telefono,correo,iva,porcentaje_pagos,isr,nombre_administrador,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.nombre_empresa,OLD.nit,OLD.telefono,OLD.correo,OLD.iva,OLD.porcentaje_pagos,OLD.isr,OLD.nombre_administrador,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- man_transportista
CREATE TRIGGER `tg_man_transp_ai` AFTER INSERT ON `man_transportista` FOR EACH ROW BEGIN
  INSERT INTO Bman_transportista (operacion,codigo,nombre_comercial,nit,nombres,apellidos,direccion,telefono,correo,impuesto,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.nombre_comercial,NEW.nit,NEW.nombres,NEW.apellidos,NEW.direccion,NEW.telefono,NEW.correo,NEW.impuesto,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_man_transp_au` AFTER UPDATE ON `man_transportista` FOR EACH ROW BEGIN
  INSERT INTO Bman_transportista (operacion,codigo,nombre_comercial,nit,nombres,apellidos,direccion,telefono,correo,impuesto,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.nombre_comercial,NEW.nit,NEW.nombres,NEW.apellidos,NEW.direccion,NEW.telefono,NEW.correo,NEW.impuesto,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_man_transp_ad` AFTER DELETE ON `man_transportista` FOR EACH ROW BEGIN
  INSERT INTO Bman_transportista (operacion,codigo,nombre_comercial,nit,nombres,apellidos,direccion,telefono,correo,impuesto,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.nombre_comercial,OLD.nit,OLD.nombres,OLD.apellidos,OLD.direccion,OLD.telefono,OLD.correo,OLD.impuesto,OLD.estado,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- man_pilotos
CREATE TRIGGER `tg_man_pilotos_ai` AFTER INSERT ON `man_pilotos` FOR EACH ROW BEGIN
  INSERT INTO Bman_pilotos (operacion,codigo,nombres,apellidos,id_transportista,licencia,tipo_licencia,fecha_vigencia,direccion,telefono,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.nombres,NEW.apellidos,NEW.id_transportista,NEW.licencia,NEW.tipo_licencia,NEW.fecha_vigencia,NEW.direccion,NEW.telefono,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_man_pilotos_au` AFTER UPDATE ON `man_pilotos` FOR EACH ROW BEGIN
  INSERT INTO Bman_pilotos (operacion,codigo,nombres,apellidos,id_transportista,licencia,tipo_licencia,fecha_vigencia,direccion,telefono,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.nombres,NEW.apellidos,NEW.id_transportista,NEW.licencia,NEW.tipo_licencia,NEW.fecha_vigencia,NEW.direccion,NEW.telefono,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_man_pilotos_ad` AFTER DELETE ON `man_pilotos` FOR EACH ROW BEGIN
  INSERT INTO Bman_pilotos (operacion,codigo,nombres,apellidos,id_transportista,licencia,tipo_licencia,fecha_vigencia,direccion,telefono,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.nombres,OLD.apellidos,OLD.id_transportista,OLD.licencia,OLD.tipo_licencia,OLD.fecha_vigencia,OLD.direccion,OLD.telefono,OLD.estado,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- man_camion
CREATE TRIGGER `tg_man_camion_ai` AFTER INSERT ON `man_camion` FOR EACH ROW BEGIN
  INSERT INTO Bman_camion (operacion,codigo,placa,id_transportista,id_tipo_camion,marca,color,anio,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.placa,NEW.id_transportista,NEW.id_tipo_camion,NEW.marca,NEW.color,NEW.anio,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_man_camion_au` AFTER UPDATE ON `man_camion` FOR EACH ROW BEGIN
  INSERT INTO Bman_camion (operacion,codigo,placa,id_transportista,id_tipo_camion,marca,color,anio,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.placa,NEW.id_transportista,NEW.id_tipo_camion,NEW.marca,NEW.color,NEW.anio,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_man_camion_ad` AFTER DELETE ON `man_camion` FOR EACH ROW BEGIN
  INSERT INTO Bman_camion (operacion,codigo,placa,id_transportista,id_tipo_camion,marca,color,anio,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.placa,OLD.id_transportista,OLD.id_tipo_camion,OLD.marca,OLD.color,OLD.anio,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- man_poliza
CREATE TRIGGER `tg_man_poliza_ai` AFTER INSERT ON `man_poliza` FOR EACH ROW BEGIN
  INSERT INTO Bman_poliza (operacion,codigo,nombre_poliza,id_empresa,id_producto,fecha,fecha_liquidacion,descripcion,cantidad_bultos,cantidad_piezas,peso_quintales,peso_kilogramos,peso_total,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.nombre_poliza,NEW.id_empresa,NEW.id_producto,NEW.fecha,NEW.fecha_liquidacion,NEW.descripcion,NEW.cantidad_bultos,NEW.cantidad_piezas,NEW.peso_quintales,NEW.peso_kilogramos,NEW.peso_total,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_man_poliza_au` AFTER UPDATE ON `man_poliza` FOR EACH ROW BEGIN
  INSERT INTO Bman_poliza (operacion,codigo,nombre_poliza,id_empresa,id_producto,fecha,fecha_liquidacion,descripcion,cantidad_bultos,cantidad_piezas,peso_quintales,peso_kilogramos,peso_total,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.nombre_poliza,NEW.id_empresa,NEW.id_producto,NEW.fecha,NEW.fecha_liquidacion,NEW.descripcion,NEW.cantidad_bultos,NEW.cantidad_piezas,NEW.peso_quintales,NEW.peso_kilogramos,NEW.peso_total,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_man_poliza_ad` AFTER DELETE ON `man_poliza` FOR EACH ROW BEGIN
  INSERT INTO Bman_poliza (operacion,codigo,nombre_poliza,id_empresa,id_producto,fecha,fecha_liquidacion,descripcion,cantidad_bultos,cantidad_piezas,peso_quintales,peso_kilogramos,peso_total,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.nombre_poliza,OLD.id_empresa,OLD.id_producto,OLD.fecha,OLD.fecha_liquidacion,OLD.descripcion,OLD.cantidad_bultos,OLD.cantidad_piezas,OLD.peso_quintales,OLD.peso_kilogramos,OLD.peso_total,OLD.estado,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- man_facturas_vales
CREATE TRIGGER `tg_man_fv_ai` AFTER INSERT ON `man_facturas_vales` FOR EACH ROW BEGIN
  INSERT INTO Bman_facturas_vales (operacion,codigo,factura,id_producto,id_bomba,descripcion_compra,fecha,unidades,precio,saldo,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.codigo,NEW.factura,NEW.id_producto,NEW.id_bomba,NEW.descripcion_compra,NEW.fecha,NEW.unidades,NEW.precio,NEW.saldo,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_man_fv_au` AFTER UPDATE ON `man_facturas_vales` FOR EACH ROW BEGIN
  INSERT INTO Bman_facturas_vales (operacion,codigo,factura,id_producto,id_bomba,descripcion_compra,fecha,unidades,precio,saldo,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.codigo,NEW.factura,NEW.id_producto,NEW.id_bomba,NEW.descripcion_compra,NEW.fecha,NEW.unidades,NEW.precio,NEW.saldo,NEW.estado,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_man_fv_ad` AFTER DELETE ON `man_facturas_vales` FOR EACH ROW BEGIN
  INSERT INTO Bman_facturas_vales (operacion,codigo,factura,id_producto,id_bomba,descripcion_compra,fecha,unidades,precio,saldo,estado,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.codigo,OLD.factura,OLD.id_producto,OLD.id_bomba,OLD.descripcion_compra,OLD.fecha,OLD.unidades,OLD.precio,OLD.saldo,OLD.estado,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- pro_poliza_detalle
CREATE TRIGGER `tg_pro_pd_ai` AFTER INSERT ON `pro_poliza_detalle` FOR EACH ROW BEGIN
  INSERT INTO Bpro_poliza_detalle (operacion,correlativo,num_envio,id_poliza,id_transportista,id_camion,id_piloto,id_tarifa_embarque,fecha,tipo,cantidad_bultos_piezas,peso,valor,estado,observaciones,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.correlativo,NEW.num_envio,NEW.id_poliza,NEW.id_transportista,NEW.id_camion,NEW.id_piloto,NEW.id_tarifa_embarque,NEW.fecha,NEW.tipo,NEW.cantidad_bultos_piezas,NEW.peso,NEW.valor,NEW.estado,NEW.observaciones,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_pro_pd_au` AFTER UPDATE ON `pro_poliza_detalle` FOR EACH ROW BEGIN
  INSERT INTO Bpro_poliza_detalle (operacion,correlativo,num_envio,id_poliza,id_transportista,id_camion,id_piloto,id_tarifa_embarque,fecha,tipo,cantidad_bultos_piezas,peso,valor,estado,observaciones,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.correlativo,NEW.num_envio,NEW.id_poliza,NEW.id_transportista,NEW.id_camion,NEW.id_piloto,NEW.id_tarifa_embarque,NEW.fecha,NEW.tipo,NEW.cantidad_bultos_piezas,NEW.peso,NEW.valor,NEW.estado,NEW.observaciones,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_pro_pd_ad` AFTER DELETE ON `pro_poliza_detalle` FOR EACH ROW BEGIN
  INSERT INTO Bpro_poliza_detalle (operacion,correlativo,num_envio,id_poliza,id_transportista,id_camion,id_piloto,id_tarifa_embarque,fecha,tipo,cantidad_bultos_piezas,peso,valor,estado,observaciones,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.correlativo,OLD.num_envio,OLD.id_poliza,OLD.id_transportista,OLD.id_camion,OLD.id_piloto,OLD.id_tarifa_embarque,OLD.fecha,OLD.tipo,OLD.cantidad_bultos_piezas,OLD.peso,OLD.valor,OLD.estado,OLD.observaciones,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- pro_anticipo_provision
CREATE TRIGGER `tg_pro_ap_ai` AFTER INSERT ON `pro_anticipo_provision` FOR EACH ROW BEGIN
  INSERT INTO Bpro_anticipo_provision (operacion,correlativo,num_anticipo,id_poliza,id_transportista,id_camion,id_piloto,id_tipo_anticipo_provision,fecha,valor,estado,descripcion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.correlativo,NEW.num_anticipo,NEW.id_poliza,NEW.id_transportista,NEW.id_camion,NEW.id_piloto,NEW.id_tipo_anticipo_provision,NEW.fecha,NEW.valor,NEW.estado,NEW.descripcion,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_pro_ap_au` AFTER UPDATE ON `pro_anticipo_provision` FOR EACH ROW BEGIN
  INSERT INTO Bpro_anticipo_provision (operacion,correlativo,num_anticipo,id_poliza,id_transportista,id_camion,id_piloto,id_tipo_anticipo_provision,fecha,valor,estado,descripcion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.correlativo,NEW.num_anticipo,NEW.id_poliza,NEW.id_transportista,NEW.id_camion,NEW.id_piloto,NEW.id_tipo_anticipo_provision,NEW.fecha,NEW.valor,NEW.estado,NEW.descripcion,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_pro_ap_ad` AFTER DELETE ON `pro_anticipo_provision` FOR EACH ROW BEGIN
  INSERT INTO Bpro_anticipo_provision (operacion,correlativo,num_anticipo,id_poliza,id_transportista,id_camion,id_piloto,id_tipo_anticipo_provision,fecha,valor,estado,descripcion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.correlativo,OLD.num_anticipo,OLD.id_poliza,OLD.id_transportista,OLD.id_camion,OLD.id_piloto,OLD.id_tipo_anticipo_provision,OLD.fecha,OLD.valor,OLD.estado,OLD.descripcion,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- pro_detalle_facturas
CREATE TRIGGER `tg_pro_df_ai` AFTER INSERT ON `pro_detalle_facturas` FOR EACH ROW BEGIN
  INSERT INTO Bpro_detalle_facturas (operacion,correlativo,num_vale,id_factura_vale,id_poliza,id_transportista,id_camion,id_piloto,fecha,cantidad,total,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.correlativo,NEW.num_vale,NEW.id_factura_vale,NEW.id_poliza,NEW.id_transportista,NEW.id_camion,NEW.id_piloto,NEW.fecha,NEW.cantidad,NEW.total,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_pro_df_au` AFTER UPDATE ON `pro_detalle_facturas` FOR EACH ROW BEGIN
  INSERT INTO Bpro_detalle_facturas (operacion,correlativo,num_vale,id_factura_vale,id_poliza,id_transportista,id_camion,id_piloto,fecha,cantidad,total,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.correlativo,NEW.num_vale,NEW.id_factura_vale,NEW.id_poliza,NEW.id_transportista,NEW.id_camion,NEW.id_piloto,NEW.fecha,NEW.cantidad,NEW.total,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_pro_df_ad` AFTER DELETE ON `pro_detalle_facturas` FOR EACH ROW BEGIN
  INSERT INTO Bpro_detalle_facturas (operacion,correlativo,num_vale,id_factura_vale,id_poliza,id_transportista,id_camion,id_piloto,fecha,cantidad,total,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.correlativo,OLD.num_vale,OLD.id_factura_vale,OLD.id_poliza,OLD.id_transportista,OLD.id_camion,OLD.id_piloto,OLD.fecha,OLD.cantidad,OLD.total,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

-- pro_liquidaciones
CREATE TRIGGER `tg_pro_liq_ai` AFTER INSERT ON `pro_liquidaciones` FOR EACH ROW BEGIN
  INSERT INTO Bpro_liquidaciones (operacion,correlativo,num_liquidacion,id_poliza,id_transportista,cantidad_viajes,valor_viajes,cantidad_vale,valor_vales,cantidad_anticipos,valor_anticipos,valor_liquidacion,estado,fecha_liquidacion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('INSERT',NEW.correlativo,NEW.num_liquidacion,NEW.id_poliza,NEW.id_transportista,NEW.cantidad_viajes,NEW.valor_viajes,NEW.cantidad_vale,NEW.valor_vales,NEW.cantidad_anticipos,NEW.valor_anticipos,NEW.valor_liquidacion,NEW.estado,NEW.fecha_liquidacion,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_pro_liq_au` AFTER UPDATE ON `pro_liquidaciones` FOR EACH ROW BEGIN
  INSERT INTO Bpro_liquidaciones (operacion,correlativo,num_liquidacion,id_poliza,id_transportista,cantidad_viajes,valor_viajes,cantidad_vale,valor_vales,cantidad_anticipos,valor_anticipos,valor_liquidacion,estado,fecha_liquidacion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('UPDATE',NEW.correlativo,NEW.num_liquidacion,NEW.id_poliza,NEW.id_transportista,NEW.cantidad_viajes,NEW.valor_viajes,NEW.cantidad_vale,NEW.valor_vales,NEW.cantidad_anticipos,NEW.valor_anticipos,NEW.valor_liquidacion,NEW.estado,NEW.fecha_liquidacion,NEW.usuario_graba,NEW.fecha_hora_graba,NEW.usuario_graba);
END$$
CREATE TRIGGER `tg_pro_liq_ad` AFTER DELETE ON `pro_liquidaciones` FOR EACH ROW BEGIN
  INSERT INTO Bpro_liquidaciones (operacion,correlativo,num_liquidacion,id_poliza,id_transportista,cantidad_viajes,valor_viajes,cantidad_vale,valor_vales,cantidad_anticipos,valor_anticipos,valor_liquidacion,estado,fecha_liquidacion,usuario_graba,fecha_hora_graba,usuario_accion)
  VALUES ('DELETE',OLD.correlativo,OLD.num_liquidacion,OLD.id_poliza,OLD.id_transportista,OLD.cantidad_viajes,OLD.valor_viajes,OLD.cantidad_vale,OLD.valor_vales,OLD.cantidad_anticipos,OLD.valor_anticipos,OLD.valor_liquidacion,OLD.estado,OLD.fecha_liquidacion,OLD.usuario_graba,OLD.fecha_hora_graba,CURRENT_USER());
END$$

DELIMITER ;

-- =====================================================================
--  DATOS BASE
-- =====================================================================
INSERT INTO `adm_roles` (`tipo_rol`,`descripcion`,`estado`,`usuario_graba`) VALUES
  ('ADMIN','Administrador del sistema','ACTIVO','sistema'),
  ('OPERADOR','Operador de procesos','ACTIVO','sistema');

INSERT INTO `con_parametros` (`codigo`,`nombre_empresa`,`nit`,`telefono`,`correo`,`iva`,`porcentaje_pagos`,`isr`,`nombre_administrador`,`usuario_graba`)
VALUES (1,'SETRASA','1234567-8','2222-3333','admin@setrasa.com',12.00,5.00,5.00,'Administrador','sistema');

-- El usuario administrador se crea con: npm run init:admin  (contraseña hasheada con bcrypt)
