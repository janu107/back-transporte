/**
 * logger.js
 * Logger central con salida a consola y a archivos dentro de ./logs.
 * Los metadatos sensibles se redactan automáticamente.
 */
const fs = require('fs');
const path = require('path');
const util = require('util');

const LOG_DIR = path.resolve(__dirname, '../../logs');
const APP_LOG = path.join(LOG_DIR, 'app.log');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');
const SENSITIVE_KEYS = /authorization|cookie|password|contrasena|token|secret|db_password/i;

let appStream;
let errorStream;

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  appStream = fs.createWriteStream(APP_LOG, { flags: 'a', encoding: 'utf8' });
  errorStream = fs.createWriteStream(ERROR_LOG, { flags: 'a', encoding: 'utf8' });
  appStream.on('error', (err) => {
    console.error(`[ERROR] ${new Date().toISOString()} No se pudo escribir app.log: ${err.message}`);
    appStream = null;
  });
  errorStream.on('error', (err) => {
    console.error(`[ERROR] ${new Date().toISOString()} No se pudo escribir error.log: ${err.message}`);
    errorStream = null;
  });
} catch (err) {
  console.error(`[ERROR] ${new Date().toISOString()} No se pudo crear el directorio de logs: ${err.message}`);
}

function redact(value, seen = new WeakSet()) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      stack: process.env.NODE_ENV === 'production' ? undefined : value.stack,
    };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';

  seen.add(value);
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    clean[key] = SENSITIVE_KEYS.test(key) ? '[REDACTED]' : redact(item, seen);
  }
  seen.delete(value);
  return clean;
}

function serializeMeta(meta) {
  if (meta === undefined) return '';
  try {
    return ` ${JSON.stringify(redact(meta))}`;
  } catch {
    return ` ${util.inspect(meta, { depth: 3, breakLength: Infinity })}`;
  }
}

function write(level, message, meta) {
  const timestamp = new Date().toISOString();
  const text = message instanceof Error ? message.message : String(message);
  const effectiveMeta = message instanceof Error ? { error: message, ...meta } : meta;
  const line = `[${level.toUpperCase()}] ${timestamp} ${text}${serializeMeta(effectiveMeta)}`;
  const consoleMethod = level === 'error' || level === 'fatal'
    ? 'error'
    : level === 'warn' ? 'warn' : level === 'debug' ? 'debug' : 'log';

  console[consoleMethod](line);
  appStream?.write(`${line}\n`);
  if (level === 'error' || level === 'fatal') errorStream?.write(`${line}\n`);
}

const logger = {
  debug(message, meta) {
    if (process.env.NODE_ENV !== 'production') write('debug', message, meta);
  },
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
  fatal: (message, meta) => write('fatal', message, meta),
  redact,
};

module.exports = logger;
