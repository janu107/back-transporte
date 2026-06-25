/**
 * configuracion.controller.js
 * Empresas (con_empresas) como CRUD y Parámetros (con_parametros) como fila única (codigo=1).
 */
const { byFixed } = require('./crud.factory');
const { queryOne, execute } = require('../database/db');
const { success } = require('../utils/response');

const empresas = byFixed('empresas');
const userOf = (req) => (req.user && req.user.usuario) || 'sistema';

module.exports = {
  // ---- Empresas ----
  listEmpresas: empresas.list,
  createEmpresa: empresas.create,
  updateEmpresa: empresas.update,
  removeEmpresa: empresas.remove,

  // ---- Parámetros (fila única codigo = 1) ----
  async getParametros(req, res, next) {
    try {
      let row = await queryOne('SELECT * FROM con_parametros WHERE codigo = 1');
      if (!row) {
        // Crea la fila por defecto si no existe
        await execute('INSERT INTO con_parametros (codigo, usuario_graba) VALUES (1, ?)', [userOf(req)]);
        row = await queryOne('SELECT * FROM con_parametros WHERE codigo = 1');
      }
      success(res, row);
    } catch (e) { next(e); }
  },

  async updateParametros(req, res, next) {
    try {
      const b = req.body;
      await execute(
        `UPDATE con_parametros SET
            nombre_empresa = ?, nit = ?, telefono = ?, correo = ?,
            iva = ?, porcentaje_pagos = ?, isr = ?, nombre_administrador = ?, usuario_graba = ?
          WHERE codigo = 1`,
        [
          b.nombre_empresa || null, b.nit || null, b.telefono || null, b.correo || null,
          b.iva || 0, b.porcentaje_pagos || 0, b.isr || 0, b.nombre_administrador || null, userOf(req),
        ]
      );
      const row = await queryOne('SELECT * FROM con_parametros WHERE codigo = 1');
      success(res, row, 'Parámetros actualizados correctamente');
    } catch (e) { next(e); }
  },
};
