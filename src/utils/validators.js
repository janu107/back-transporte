/**
 * validators.js
 * Validadores reutilizables del backend (uso futuro en controllers/services).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmail(value) {
  return typeof value === 'string' && EMAIL_REGEX.test(value.trim());
}

function isNonEmpty(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function isPositiveNumber(value) {
  const n = Number(value);
  return !Number.isNaN(n) && n >= 0;
}

/**
 * validateRequired
 * Verifica que un objeto contenga todos los campos indicados.
 * @returns {string[]} lista de campos faltantes
 */
function validateRequired(obj = {}, fields = []) {
  return fields.filter((f) => !isNonEmpty(obj[f]));
}

module.exports = { isEmail, isNonEmpty, isPositiveNumber, validateRequired };
