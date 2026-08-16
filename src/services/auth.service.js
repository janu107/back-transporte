/**
 * auth.service.js
 * Lógica de autenticación real: verificación de credenciales contra adm_usuarios,
 * control de intentos fallidos / bloqueo, y generación de JWT.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, queryOne, execute } = require('../database/db');
const env = require('../config/env');

const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;

/** Obtiene el primer rol activo del usuario (o 'USUARIO' por defecto). */
/**
 * Roles ACTIVOS del usuario. Un usuario puede tener varios: los permisos son
 * la unión de todos (ver config/permisos.js).
 */
async function obtenerRoles(idUsuario) {
  const filas = await query(
    `SELECT r.tipo_rol FROM adm_usuario_rol ur
       JOIN adm_roles r ON r.codigo = ur.id_rol
      WHERE ur.id_usuario = ? AND UPPER(ur.estado) = 'ACTIVO'
        AND UPPER(COALESCE(r.estado, 'ACTIVO')) = 'ACTIVO'
      ORDER BY ur.codigo`,
    [idUsuario]
  );
  return [...new Set(filas.map((f) => String(f.tipo_rol).toUpperCase()))];
}

/** Primer rol del usuario (compatibilidad con lo que espera el frontend). */
async function obtenerRol(idUsuario) {
  const roles = await obtenerRoles(idUsuario);
  return roles[0] || 'USUARIO';
}

/** Firma un JWT con los datos del usuario. */
function firmarToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

/**
 * login
 * Valida credenciales y devuelve { token, user }. Lanza Error con .status en fallo.
 */
async function login(usuario, contrasena) {
  if (!usuario || !contrasena) {
    const e = new Error('Usuario y contraseña son obligatorios'); e.status = 400; throw e;
  }

  const u = await queryOne('SELECT * FROM adm_usuarios WHERE usuario = ?', [usuario]);
  if (!u) { const e = new Error('Usuario o contraseña incorrectos'); e.status = 401; throw e; }

  if (u.estado !== 'ACTIVO') {
    const e = new Error('El usuario está inactivo o bloqueado'); e.status = 403; throw e;
  }
  if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) {
    const e = new Error('Usuario bloqueado temporalmente. Intente más tarde.'); e.status = 403; throw e;
  }

  const ok = u.contrasena ? await bcrypt.compare(contrasena, u.contrasena) : false;
  if (!ok) {
    const intentos = (u.intentos_fallidos || 0) + 1;
    if (intentos >= MAX_INTENTOS) {
      await execute(
        'UPDATE adm_usuarios SET intentos_fallidos = ?, bloqueado_hasta = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE codigo = ?',
        [intentos, BLOQUEO_MINUTOS, u.codigo]
      );
    } else {
      await execute('UPDATE adm_usuarios SET intentos_fallidos = ? WHERE codigo = ?', [intentos, u.codigo]);
    }
    const e = new Error('Usuario o contraseña incorrectos'); e.status = 401; throw e;
  }

  // Éxito: limpia intentos y registra último login
  await execute(
    'UPDATE adm_usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_login = NOW() WHERE codigo = ?',
    [u.codigo]
  );

  const roles = await obtenerRoles(u.codigo);
  const rol = roles[0] || 'USUARIO';
  const user = {
    codigo: u.codigo,
    usuario: u.usuario,
    nombre: u.nombre,
    correo: u.correo,
    rol,   // principal (compatibilidad)
    roles, // todos los asignados
    debe_cambiar_pwd: !!u.debe_cambiar_pwd,
  };
  const token = firmarToken({
    codigo: u.codigo, usuario: u.usuario, nombre: u.nombre, rol, roles,
  });
  return { token, user };
}

module.exports = { login, firmarToken, obtenerRol, obtenerRoles };
