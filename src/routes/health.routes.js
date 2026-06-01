/**
 * health.routes.js
 * Ruta de verificación de estado de la API.
 *   GET /api/health -> { ok: true, message: "API app_transporte funcionando" }
 */
const { Router } = require('express');
const healthController = require('../controllers/health.controller');

const router = Router();

router.get('/', healthController.check);

module.exports = router;
