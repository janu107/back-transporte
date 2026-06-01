/**
 * validate.middleware.js
 * Middleware genérico de validación de campos requeridos en el body.
 *
 * Uso: router.post('/x', validateBody(['nombre', 'correo']), handler)
 */
const { error } = require('../utils/response');
const { validateRequired } = require('../utils/validators');

function validateBody(requiredFields = []) {
  return (req, res, next) => {
    const missing = validateRequired(req.body || {}, requiredFields);
    if (missing.length > 0) {
      return error(res, `Campos requeridos faltantes: ${missing.join(', ')}`, 400, { missing });
    }
    return next();
  };
}

module.exports = validateBody;
