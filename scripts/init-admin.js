/**
 * init-admin.js
 * Crea (o actualiza) el usuario administrador inicial con contraseña hasheada
 * y le asigna el rol ADMIN. Idempotente: puede ejecutarse varias veces.
 *
 * Ejecución:  npm run init:admin
 * Credenciales por defecto:  admin / Admin123!
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { queryOne, execute } = require('../src/database/db');
const logger = require('../src/utils/logger');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin123!';
const ADMIN_NOMBRE = 'Administrador';

async function main() {
  logger.info('Inicializando usuario administrador...');

  // 1) Asegura el rol ADMIN
  let rol = await queryOne("SELECT codigo FROM adm_roles WHERE tipo_rol = 'ADMIN'");
  if (!rol) {
    const r = await execute(
      "INSERT INTO adm_roles (tipo_rol, descripcion, estado, usuario_graba) VALUES ('ADMIN','Administrador del sistema','ACTIVO','sistema')"
    );
    rol = { codigo: r.insertId };
    logger.info('Rol ADMIN creado.');
  }

  // 2) Crea o actualiza el usuario admin
  const hash = await bcrypt.hash(ADMIN_PASS, 10);
  let user = await queryOne('SELECT codigo FROM adm_usuarios WHERE usuario = ?', [ADMIN_USER]);

  if (user) {
    await execute(
      "UPDATE adm_usuarios SET contrasena = ?, estado = 'ACTIVO', intentos_fallidos = 0, bloqueado_hasta = NULL, usuario_graba = 'sistema' WHERE codigo = ?",
      [hash, user.codigo]
    );
    logger.info(`Usuario "${ADMIN_USER}" ya existía: contraseña restablecida.`);
  } else {
    const r = await execute(
      `INSERT INTO adm_usuarios (usuario, nombre, correo, estado, puesto, fecha_inicio, contrasena, debe_cambiar_pwd, intentos_fallidos, usuario_graba)
       VALUES (?, ?, ?, 'ACTIVO', 'Administrador', CURDATE(), ?, 0, 0, 'sistema')`,
      [ADMIN_USER, ADMIN_NOMBRE, 'admin@setrasa.com', hash]
    );
    user = { codigo: r.insertId };
    logger.info(`Usuario "${ADMIN_USER}" creado.`);
  }

  // 3) Asigna rol ADMIN si no lo tiene
  const asignacion = await queryOne(
    'SELECT codigo FROM adm_usuario_rol WHERE id_usuario = ? AND id_rol = ?',
    [user.codigo, rol.codigo]
  );
  if (!asignacion) {
    await execute(
      "INSERT INTO adm_usuario_rol (id_usuario, id_rol, estado, usuario_graba) VALUES (?, ?, 'ACTIVO', 'sistema')",
      [user.codigo, rol.codigo]
    );
    logger.info('Rol ADMIN asignado al usuario.');
  }

  logger.info('-------------------------------------------');
  logger.info(`  Usuario:    ${ADMIN_USER}`);
  logger.info(`  Contraseña: ${ADMIN_PASS}`);
  logger.info('-------------------------------------------');
  logger.info('Listo. Ya puedes iniciar sesión en el sistema.');
  process.exit(0);
}

main().catch((err) => {
  logger.error('init-admin falló:', err.message);
  logger.error('¿Está MySQL activo y existe la base "app_transporte"? Ejecuta primero sql/app_transporte.sql');
  process.exit(1);
});
