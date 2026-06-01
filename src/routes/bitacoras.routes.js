/**
 * bitacoras.routes.js
 * Rutas del módulo Bitácoras / Auditoría.
 *   GET /api/bitacoras?modulo=&operacion=&usuario=&fechaInicio=&fechaFin=
 */
const { Router } = require('express');
const ctrl = require('../controllers/bitacoras.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.get('/', authMiddleware, ctrl.list);

module.exports = router;
