/**
 * crud.factory.js
 * Fábrica de handlers Express para CRUD genérico, basada en config/resources.js
 * y services/crud.service.js. Evita repetir el mismo código en cada módulo.
 *
 * - byParam(): resuelve el recurso desde req.params.recurso (catálogos, mantenimientos, procesos).
 * - byFixed(slug): handlers atados a un recurso fijo (roles, empresas, usuario-rol).
 */
const crud = require('../services/crud.service');
const { getResource } = require('../config/resources');
const { success, error } = require('../utils/response');

const userOf = (req) => (req.user && req.user.usuario) || 'sistema';

function buildHandlers(resolveDef) {
  return {
    async list(req, res, next) {
      try {
        const def = resolveDef(req);
        success(res, await crud.list(def));
      } catch (e) { next(e); }
    },
    async getById(req, res, next) {
      try {
        const def = resolveDef(req);
        const row = await crud.getById(def, req.params.id);
        if (!row) return error(res, 'Registro no encontrado', 404);
        success(res, row);
      } catch (e) { next(e); }
    },
    async create(req, res, next) {
      try {
        const def = resolveDef(req);
        const row = await crud.create(def, req.body, userOf(req));
        success(res, row, 'Registro creado correctamente', 201);
      } catch (e) { next(e); }
    },
    async update(req, res, next) {
      try {
        const def = resolveDef(req);
        const row = await crud.update(def, req.params.id, req.body, userOf(req));
        success(res, row, 'Registro actualizado correctamente');
      } catch (e) { next(e); }
    },
    async changeEstado(req, res, next) {
      try {
        const def = resolveDef(req);
        const row = await crud.patchEstado(def, req.params.id, req.body.estado, userOf(req));
        success(res, row, 'Estado actualizado correctamente');
      } catch (e) { next(e); }
    },
    async remove(req, res, next) {
      try {
        const def = resolveDef(req);
        await crud.remove(def, req.params.id);
        success(res, null, 'Registro eliminado correctamente');
      } catch (e) { next(e); }
    },
  };
}

/** Handlers que resuelven el recurso desde el parámetro de URL :recurso. */
const byParam = () => buildHandlers((req) => getResource(req.params.recurso));

/** Handlers atados a un recurso fijo por slug. */
const byFixed = (slug) => buildHandlers(() => getResource(slug));

module.exports = { byParam, byFixed };
