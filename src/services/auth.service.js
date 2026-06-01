/**
 * auth.service.js
 * Lógica de negocio de autenticación (uso futuro - Fase backend).
 *
 * Aquí se implementará: verificación de credenciales contra adm_usuarios,
 * hashing/compare de contraseñas, control de intentos fallidos y bloqueo,
 * y generación de JWT. Por ahora son placeholders sin acceso a base de datos.
 */

// const { getPool } = require('../database/pool');

async function authenticate(usuario, contrasena) {
  throw new Error('auth.service.authenticate no implementado en esta fase.');
}

module.exports = { authenticate };
