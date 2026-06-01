/**
 * auth.routes.js
 * Rutas de autenticación.
 *   POST /api/auth/login
 *   GET  /api/auth/me      (requiere token - authMiddleware)
 *   POST /api/auth/logout
 */
const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.post('/login', authController.login);
router.get('/me', authMiddleware, authController.me);
router.post('/logout', authController.logout);

module.exports = router;
