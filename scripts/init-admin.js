/**
 * init-admin.js
 * Script de inicialización del usuario administrador (uso futuro - Fase backend).
 *
 * Cuando la base de datos esté activa, este script creará/actualizará el usuario
 * administrador inicial en adm_usuarios con una contraseña hasheada y le asignará
 * el rol ADMIN en adm_usuario_rol.
 *
 * Ejecución: npm run init:admin
 */
require('dotenv').config();
const logger = require('../src/utils/logger');

async function main() {
  logger.warn('init-admin: la creación real del administrador no está habilitada en esta fase.');
  logger.info('Pasos previstos para la Fase backend:');
  logger.info('  1) Conectar al pool MySQL (src/database/pool.js).');
  logger.info('  2) Hashear la contraseña del admin (p.ej. con bcrypt).');
  logger.info('  3) INSERT/UPSERT en adm_usuarios (usuario=admin, estado=ACTIVO).');
  logger.info('  4) Asignar rol ADMIN en adm_roles / adm_usuario_rol.');
  logger.info('  5) Registrar la operación en las tablas de bitácora (Badm_*).');

  // Credenciales sugeridas para la fase de pruebas del frontend:
  //   usuario: admin
  //   contraseña: Admin123!
  process.exit(0);
}

main().catch((err) => {
  logger.error('init-admin falló:', err.message);
  process.exit(1);
});
