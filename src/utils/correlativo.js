/**
 * correlativo.js
 * Genera correlativos con formato AÑO + 5 dígitos (ej. 202600001).
 * Debe ejecutarse dentro de una transacción (recibe la conexión) para evitar
 * duplicados bajo concurrencia.
 */

/**
 * @param {object} conn   conexión de la transacción (conn.query)
 * @param {string} tabla  nombre de la tabla
 * @param {string} columna columna del correlativo (VARCHAR con formato AÑO+00000)
 * @param {number} anio   año (4 dígitos)
 * @returns {Promise<string>} p.ej. "202600001"
 */
async function siguienteCorrelativo(conn, tabla, columna, anio) {
  const prefijo = String(anio);
  const [rows] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING(\`${columna}\`, 5) AS UNSIGNED)) AS maxseq
       FROM \`${tabla}\`
      WHERE \`${columna}\` LIKE ? AND CHAR_LENGTH(\`${columna}\`) = 9`,
    [`${prefijo}%`]
  );
  const siguiente = Number(rows[0]?.maxseq || 0) + 1;
  return prefijo + String(siguiente).padStart(5, '0');
}

module.exports = { siguienteCorrelativo };
