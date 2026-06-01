/**
 * health.controller.js
 * Controlador del health check de la API.
 */

function check(req, res) {
  res.json({ ok: true, message: 'API app_transporte funcionando' });
}

module.exports = { check };
