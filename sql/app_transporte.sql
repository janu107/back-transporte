-- =====================================================================
-- app_transporte.sql
-- Esquema base de la base de datos app_transporte (uso futuro - Fase backend).
--
-- Incluye las tablas principales de cada módulo. Cada tabla principal cuenta
-- además con una tabla de bitácora (prefijo "B") con la misma estructura más
-- columnas de auditoría (operacion, usuario_graba, fecha_hora_graba,
-- usuario_accion, fecha_hora_accion). Por brevedad aquí se definen las tablas
-- principales y un ejemplo completo de bitácora; el resto de bitácoras siguen
-- exactamente el mismo patrón mostrado en el dump original.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `app_transporte`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `app_transporte`;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================ SEGURIDAD ==============================

CREATE TABLE IF NOT EXISTS `adm_roles` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `tipo_rol` VARCHAR(50) NOT NULL,
  `descripcion` VARCHAR(150) DEFAULT NULL,
  `estado` VARCHAR(20) DEFAULT 'ACTIVO',
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `adm_usuarios` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `usuario` VARCHAR(50) NOT NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `correo` VARCHAR(150) DEFAULT NULL,
  `estado` VARCHAR(20) DEFAULT 'ACTIVO',
  `puesto` VARCHAR(100) DEFAULT NULL,
  `fecha_inicio` DATE DEFAULT NULL,
  `contrasena` VARCHAR(255) DEFAULT NULL,
  `ultimo_login` DATETIME DEFAULT NULL,
  `intentos_fallidos` TINYINT DEFAULT 0,
  `bloqueado_hasta` DATETIME DEFAULT NULL,
  `debe_cambiar_pwd` TINYINT(1) DEFAULT 0,
  `fecha_cambio_pwd` DATETIME DEFAULT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`),
  UNIQUE KEY `uq_adm_usuarios_usuario` (`usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `adm_usuario_rol` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `id_usuario` INT NOT NULL,
  `id_rol` INT NOT NULL,
  `estado` VARCHAR(20) DEFAULT 'ACTIVO',
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`codigo`),
  KEY `fk_ur_usuario` (`id_usuario`),
  KEY `fk_ur_rol` (`id_rol`),
  CONSTRAINT `fk_ur_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `adm_usuarios` (`codigo`),
  CONSTRAINT `fk_ur_rol` FOREIGN KEY (`id_rol`) REFERENCES `adm_roles` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================ CATÁLOGOS ==============================

CREATE TABLE IF NOT EXISTS `cat_tipo_camion` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(150) NOT NULL,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cat_tipo_producto` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(150) NOT NULL,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cat_tipo_anticipo_provision` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(150) NOT NULL,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cat_ubicacion_bomba` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(150) NOT NULL,
  `direccion` VARCHAR(250) DEFAULT NULL,
  `encargado` VARCHAR(150) DEFAULT NULL,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cat_productos` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(150) NOT NULL,
  `id_tipo_producto` INT DEFAULT NULL,
  PRIMARY KEY (`codigo`),
  KEY `fk_prod_tipo` (`id_tipo_producto`),
  CONSTRAINT `fk_prod_tipo` FOREIGN KEY (`id_tipo_producto`) REFERENCES `cat_tipo_producto` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cat_bombas` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `id_ubicacion` INT DEFAULT NULL,
  `descripcion` VARCHAR(150) NOT NULL,
  `mangueras` INT DEFAULT NULL,
  `id_producto` INT DEFAULT NULL,
  PRIMARY KEY (`codigo`),
  KEY `fk_bomba_ubic` (`id_ubicacion`),
  KEY `fk_bomba_prod` (`id_producto`),
  CONSTRAINT `fk_bomba_ubic` FOREIGN KEY (`id_ubicacion`) REFERENCES `cat_ubicacion_bomba` (`codigo`),
  CONSTRAINT `fk_bomba_prod` FOREIGN KEY (`id_producto`) REFERENCES `cat_productos` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cat_tarifa_embarque` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `descripcion` VARCHAR(150) NOT NULL,
  `origen` VARCHAR(150) DEFAULT NULL,
  `destino` VARCHAR(150) DEFAULT NULL,
  `valor` DECIMAL(12,2) DEFAULT NULL,
  `estado` VARCHAR(20) DEFAULT 'ACTIVO',
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================== CONFIGURACIÓN ============================

CREATE TABLE IF NOT EXISTS `con_empresas` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `nit` VARCHAR(20) DEFAULT NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `direccion` VARCHAR(250) DEFAULT NULL,
  `telefono` VARCHAR(20) DEFAULT NULL,
  `correo` VARCHAR(150) DEFAULT NULL,
  `estado` VARCHAR(20) DEFAULT 'ACTIVO',
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `con_parametros` (
  `codigo` TINYINT NOT NULL DEFAULT 1,
  `nombre_empresa` VARCHAR(150) DEFAULT NULL,
  `nit` VARCHAR(20) DEFAULT NULL,
  `telefono` VARCHAR(20) DEFAULT NULL,
  `correo` VARCHAR(150) DEFAULT NULL,
  `iva` DECIMAL(5,2) DEFAULT NULL,
  `porcentaje_pagos` DECIMAL(5,2) DEFAULT NULL,
  `isr` DECIMAL(5,2) DEFAULT NULL,
  `nombre_administrador` VARCHAR(150) DEFAULT NULL,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================= MANTENIMIENTOS ============================

CREATE TABLE IF NOT EXISTS `man_transportista` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `nombre_comercial` VARCHAR(150) DEFAULT NULL,
  `nit` VARCHAR(20) DEFAULT NULL,
  `nombres` VARCHAR(150) DEFAULT NULL,
  `apellidos` VARCHAR(150) DEFAULT NULL,
  `direccion` VARCHAR(250) DEFAULT NULL,
  `telefono` VARCHAR(20) DEFAULT NULL,
  `correo` VARCHAR(150) DEFAULT NULL,
  `impuesto` DECIMAL(5,2) DEFAULT NULL,
  `estado` VARCHAR(20) DEFAULT 'ACTIVO',
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `man_pilotos` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `nombres` VARCHAR(150) NOT NULL,
  `apellidos` VARCHAR(150) DEFAULT NULL,
  `id_transportista` INT DEFAULT NULL,
  `licencia` VARCHAR(50) DEFAULT NULL,
  `tipo_licencia` VARCHAR(20) DEFAULT NULL,
  `fecha_vigencia` DATE DEFAULT NULL,
  `direccion` VARCHAR(250) DEFAULT NULL,
  `telefono` VARCHAR(20) DEFAULT NULL,
  `estado` VARCHAR(20) DEFAULT 'ACTIVO',
  PRIMARY KEY (`codigo`),
  KEY `fk_piloto_transp` (`id_transportista`),
  CONSTRAINT `fk_piloto_transp` FOREIGN KEY (`id_transportista`) REFERENCES `man_transportista` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `man_camion` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `placa` VARCHAR(15) NOT NULL,
  `id_transportista` INT DEFAULT NULL,
  `id_tipo_camion` INT DEFAULT NULL,
  `marca` VARCHAR(80) DEFAULT NULL,
  `color` VARCHAR(50) DEFAULT NULL,
  `anio` YEAR DEFAULT NULL,
  PRIMARY KEY (`codigo`),
  KEY `fk_camion_transp` (`id_transportista`),
  KEY `fk_camion_tipo` (`id_tipo_camion`),
  CONSTRAINT `fk_camion_transp` FOREIGN KEY (`id_transportista`) REFERENCES `man_transportista` (`codigo`),
  CONSTRAINT `fk_camion_tipo` FOREIGN KEY (`id_tipo_camion`) REFERENCES `cat_tipo_camion` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `man_poliza` (
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
  `estado` VARCHAR(20) DEFAULT 'ABIERTA',
  PRIMARY KEY (`codigo`),
  KEY `fk_poliza_empresa` (`id_empresa`),
  KEY `fk_poliza_producto` (`id_producto`),
  CONSTRAINT `fk_poliza_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `con_empresas` (`codigo`),
  CONSTRAINT `fk_poliza_producto` FOREIGN KEY (`id_producto`) REFERENCES `cat_productos` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `man_facturas_vales` (
  `codigo` INT NOT NULL AUTO_INCREMENT,
  `factura` VARCHAR(50) DEFAULT NULL,
  `id_producto` INT DEFAULT NULL,
  `id_bomba` INT DEFAULT NULL,
  `descripcion_compra` VARCHAR(250) DEFAULT NULL,
  `fecha` DATE DEFAULT NULL,
  `unidades` DECIMAL(12,2) DEFAULT NULL,
  `precio` DECIMAL(12,2) DEFAULT NULL,
  `saldo` DECIMAL(12,2) DEFAULT NULL,
  `estado` VARCHAR(20) DEFAULT 'PENDIENTE',
  PRIMARY KEY (`codigo`),
  KEY `fk_fv_producto` (`id_producto`),
  KEY `fk_fv_bomba` (`id_bomba`),
  CONSTRAINT `fk_fv_producto` FOREIGN KEY (`id_producto`) REFERENCES `cat_productos` (`codigo`),
  CONSTRAINT `fk_fv_bomba` FOREIGN KEY (`id_bomba`) REFERENCES `cat_bombas` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================ PROCESOS ===============================

CREATE TABLE IF NOT EXISTS `pro_poliza_detalle` (
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
  `estado` VARCHAR(20) DEFAULT 'PENDIENTE',
  `observaciones` VARCHAR(250) DEFAULT NULL,
  PRIMARY KEY (`correlativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pro_anticipo_provision` (
  `correlativo` INT NOT NULL AUTO_INCREMENT,
  `num_anticipo` VARCHAR(50) DEFAULT NULL,
  `id_poliza` INT DEFAULT NULL,
  `id_transportista` INT DEFAULT NULL,
  `id_camion` INT DEFAULT NULL,
  `id_piloto` INT DEFAULT NULL,
  `id_tipo_anticipo_provision` INT DEFAULT NULL,
  `fecha` DATE DEFAULT NULL,
  `valor` DECIMAL(12,2) DEFAULT NULL,
  `estado` VARCHAR(20) DEFAULT 'PENDIENTE',
  `descripcion` VARCHAR(250) DEFAULT NULL,
  PRIMARY KEY (`correlativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pro_detalle_facturas` (
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
  PRIMARY KEY (`correlativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pro_liquidaciones` (
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
  `estado` VARCHAR(20) DEFAULT 'PENDIENTE',
  `fecha_liquidacion` DATE DEFAULT NULL,
  PRIMARY KEY (`correlativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================ BITÁCORAS ==============================
-- Ejemplo del patrón de bitácora (replicar para cada tabla principal con
-- prefijo "B": Badm_usuarios, Badm_roles, Badm_usuario_rol, Bcat_*, Bcon_*,
-- Bman_*, Bpro_*). Las tablas de bitácora NO llevan claves foráneas.

CREATE TABLE IF NOT EXISTS `Badm_usuarios` (
  `bitacora_id` BIGINT NOT NULL AUTO_INCREMENT,
  `operacion` ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  `codigo` INT DEFAULT NULL,
  `usuario` VARCHAR(50) DEFAULT NULL,
  `nombre` VARCHAR(150) DEFAULT NULL,
  `correo` VARCHAR(150) DEFAULT NULL,
  `estado` VARCHAR(20) DEFAULT NULL,
  `puesto` VARCHAR(100) DEFAULT NULL,
  `fecha_inicio` DATE DEFAULT NULL,
  `contrasena` VARCHAR(255) DEFAULT NULL,
  `ultimo_login` DATETIME DEFAULT NULL,
  `intentos_fallidos` TINYINT DEFAULT NULL,
  `bloqueado_hasta` DATETIME DEFAULT NULL,
  `debe_cambiar_pwd` TINYINT(1) DEFAULT NULL,
  `fecha_cambio_pwd` DATETIME DEFAULT NULL,
  `usuario_graba` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_graba` DATETIME DEFAULT NULL,
  `usuario_accion` VARCHAR(50) DEFAULT NULL,
  `fecha_hora_accion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`bitacora_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
