/**
 * setup-db.js
 * Ejecuta un archivo de sql/ contra MySQL de forma robusta, sin depender de
 * phpMyAdmin. Parte el script en sentencias respetando las directivas DELIMITER
 * (necesarias por los triggers) y ejecuta cada una por separado.
 *
 * Uso:
 *   npm run setup:db
 *   node scripts/setup-db.js control_captura_api.sql
 * Conexión: usa las variables de entorno (.env). NO requiere base preexistente.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../src/config/env');
const logger = require('../src/utils/logger');

/** Divide un script SQL en sentencias respetando DELIMITER y quitando comentarios `--`. */
function splitStatements(sql) {
  const lines = sql.split(/\r?\n/);
  const statements = [];
  let delimiter = ';';
  let buffer = '';

  for (const raw of lines) {
    const line = raw;
    const trimmed = line.trim();

    // Ignora líneas en blanco y comentarios de línea
    if (trimmed === '' || trimmed.startsWith('--')) continue;

    // Cambio de delimitador (directiva de cliente, no se envía al servidor)
    if (/^DELIMITER\s+/i.test(trimmed)) {
      delimiter = trimmed.split(/\s+/)[1];
      continue;
    }

    buffer += line + '\n';

    if (buffer.trim().endsWith(delimiter)) {
      const stmt = buffer.trim();
      statements.push(stmt.slice(0, stmt.length - delimiter.length).trim());
      buffer = '';
    }
  }
  if (buffer.trim()) statements.push(buffer.trim());
  return statements.filter((s) => s.length > 0);
}

async function main() {
  const requestedFile = process.argv[2] || 'app_transporte.sql';
  if (path.basename(requestedFile) !== requestedFile || !requestedFile.toLowerCase().endsWith('.sql')) {
    throw new Error(`Nombre de archivo SQL no válido: ${requestedFile}`);
  }

  const file = path.join(__dirname, '..', 'sql', requestedFile);
  if (!fs.existsSync(file)) {
    throw new Error(`No existe el archivo SQL: ${file}`);
  }

  const sql = fs.readFileSync(file, 'utf8');
  const statements = splitStatements(sql);
  logger.info('Instalación SQL iniciada', { file: requestedFile, statements: statements.length });

  // Conexión sin base seleccionada (el script crea/usa la base).
  const conn = await mysql.createConnection({
    host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD,
    multipleStatements: false,
  });

  try {
    let n = 0;
    for (const stmt of statements) {
      n += 1;
      try {
        await conn.query(stmt);
      } catch (e) {
        logger.error(`Error en la sentencia #${n}:`);
        logger.error(stmt.slice(0, 160).replace(/\s+/g, ' ') + '...');
        logger.error(`${e.code} - ${e.message}`);
        throw e;
      }
    }
    logger.info('Instalación SQL completada', { file: requestedFile, executedStatements: n });
    if (requestedFile === 'app_transporte.sql') {
      logger.info('Ahora ejecuta: npm run init:admin');
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  logger.error('Instalación SQL falló', { error: err });
  process.exit(1);
});
