/**
 * logger.js
 * Logger mínimo basado en consola con marca de tiempo y nivel.
 * En fases futuras puede reemplazarse por winston/pino escribiendo a ./logs.
 */
function ts() {
  return new Date().toISOString();
}

const logger = {
  info: (...args) => console.log(`[INFO]  ${ts()}`, ...args),
  warn: (...args) => console.warn(`[WARN]  ${ts()}`, ...args),
  error: (...args) => console.error(`[ERROR] ${ts()}`, ...args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] ${ts()}`, ...args);
    }
  },
};

module.exports = logger;
