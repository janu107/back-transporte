/**
 * usuarios.controller.js
 * CRUD del módulo Usuarios (adm_usuarios) con hash de contraseña (bcrypt).
 * Nunca devuelve el campo `contrasena` al cliente.
 */
const bcrypt = require('bcryptjs');
const { query, queryOne, execute } = require('../database/db');
const { success, error } = require('../utils/response');

const userOf = (req) => (req.user && req.user.usuario) || 'sistema';

// Columnas públicas (sin contrasena)
const PUB = 'codigo, usuario, nombre, correo, estado, puesto, fecha_inicio, ultimo_login, debe_cambiar_pwd, fecha_hora_graba';

module.exports = {
  async list(req, res, next) {
    try {
      success(res, await query(`SELECT ${PUB} FROM adm_usuarios ORDER BY codigo DESC`));
    } catch (e) { next(e); }
  },

  async getById(req, res, next) {
    try {
      const row = await queryOne(`SELECT ${PUB} FROM adm_usuarios WHERE codigo = ?`, [req.params.id]);
      if (!row) return error(res, 'Usuario no encontrado', 404);
      success(res, row);
    } catch (e) { next(e); }
  },

  async create(req, res, next) {
    try {
      const { usuario, nombre, correo, estado, puesto, fecha_inicio, contrasena } = req.body;
      if (!usuario || !nombre) return error(res, 'Usuario y nombre son obligatorios', 400);
      if (!contrasena) return error(res, 'La contraseña es obligatoria', 400);

      const existe = await queryOne('SELECT codigo FROM adm_usuarios WHERE usuario = ?', [usuario]);
      if (existe) return error(res, 'El usuario ya existe', 409);

      const hash = await bcrypt.hash(contrasena, 10);
      const result = await execute(
        `INSERT INTO adm_usuarios
          (usuario, nombre, correo, estado, puesto, fecha_inicio, contrasena, debe_cambiar_pwd, intentos_fallidos, usuario_graba)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
        [usuario, nombre, correo || null, estado || 'ACTIVO', puesto || null, fecha_inicio || null, hash, userOf(req)]
      );
      const row = await queryOne(`SELECT ${PUB} FROM adm_usuarios WHERE codigo = ?`, [result.insertId]);
      success(res, row, 'Usuario creado correctamente', 201);
    } catch (e) { next(e); }
  },

  async update(req, res, next) {
    try {
      const { nombre, correo, estado, puesto, fecha_inicio } = req.body;
      await execute(
        `UPDATE adm_usuarios SET nombre = ?, correo = ?, estado = ?, puesto = ?, fecha_inicio = ?, usuario_graba = ?
          WHERE codigo = ?`,
        [nombre, correo || null, estado, puesto || null, fecha_inicio || null, userOf(req), req.params.id]
      );
      const row = await queryOne(`SELECT ${PUB} FROM adm_usuarios WHERE codigo = ?`, [req.params.id]);
      success(res, row, 'Usuario actualizado correctamente');
    } catch (e) { next(e); }
  },

  async changeEstado(req, res, next) {
    try {
      await execute('UPDATE adm_usuarios SET estado = ?, usuario_graba = ? WHERE codigo = ?',
        [req.body.estado, userOf(req), req.params.id]);
      const row = await queryOne(`SELECT ${PUB} FROM adm_usuarios WHERE codigo = ?`, [req.params.id]);
      success(res, row, 'Estado actualizado correctamente');
    } catch (e) { next(e); }
  },

  async changePassword(req, res, next) {
    try {
      const { contrasena } = req.body;
      if (!contrasena) return error(res, 'La nueva contraseña es obligatoria', 400);
      const hash = await bcrypt.hash(contrasena, 10);
      await execute(
        `UPDATE adm_usuarios SET contrasena = ?, debe_cambiar_pwd = 0, fecha_cambio_pwd = NOW(), usuario_graba = ?
          WHERE codigo = ?`,
        [hash, userOf(req), req.params.id]
      );
      success(res, null, 'Contraseña actualizada correctamente');
    } catch (e) { next(e); }
  },
};
