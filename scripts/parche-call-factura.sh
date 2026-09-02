#!/bin/bash
# ---------------------------------------------------------------------------
# Agrega la factura elegida a la llamada de sp_confirmar_despacho_api.
#
# El procedimiento pasó de 8 a 9 parámetros de entrada (p_id_factura_vale en la
# posición 8). Quien ejecuta el CALL sigue mandando 8, y por eso MySQL responde
# "expected 13, got 12".
#
# El script busca el archivo, saca copia, aplica los dos cambios y valida. Si
# algo no calza, restaura el respaldo y no deja nada a medias.
#
# Nota: el CALL suele estar partido en varias líneas, así que tanto la búsqueda
# como el conteo trabajan sobre el archivo COMPLETO, no línea por línea.
# ---------------------------------------------------------------------------
set -u

# Cuenta las interrogaciones DENTRO de la llamada, aunque abarque varias líneas.
contar_marcas() {
  perl -0777 -ne '
    if (/CALL\s+sp_confirmar_despacho_api\s*\((.*?)\)/s) {
      my $d = $1; my $n = () = $d =~ /\?/g; print $n;
    } else { print 0 }' "$1"
}

echo "=== 1. Buscando quién ejecuta el CALL ==="
# Solo archivos con la SENTENCIA (no una mención en un comentario). Se excluye
# back-transporte: ese no ejecuta el CALL, se lo pide por HTTP a este servicio.
CANDIDATOS=$(grep -rl "sp_confirmar_despacho_api" \
  /opt /home/apps /srv /var/www 2>/dev/null \
  --include='*.js' --include='*.mjs' --include='*.cjs' --include='*.ts' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude='*.bak-*')

ARCHIVOS=""
for F in $CANDIDATOS; do
  if perl -0777 -ne 'exit(/CALL\s+sp_confirmar_despacho_api\s*\(/s ? 0 : 1)' "$F"; then
    ARCHIVOS="$ARCHIVOS $F"
  fi
done

if [ -z "${ARCHIVOS// /}" ]; then
  echo "No se encontró ningún archivo con la sentencia CALL."
  exit 1
fi
for F in $ARCHIVOS; do echo "  $F"; done
echo

for F in $ARCHIVOS; do
  echo "=== 2. $F ==="

  ANTES=$(contar_marcas "$F")
  if [ "$ANTES" -ge 9 ]; then
    echo "  El CALL ya lleva $ANTES interrogaciones. Se deja como está."
    continue
  fi
  echo "  Interrogaciones actuales: $ANTES"

  RESPALDO="$F.bak-$(date +%F-%H%M%S)"
  cp "$F" "$RESPALDO"
  echo "  Respaldo: $RESPALDO"

  echo "  --- ANTES ---"
  grep -n -B 2 -A 10 "CALL sp_confirmar_despacho_api" "$F" | sed 's/^/    /'

  # (a) Una interrogación más dentro del CALL (funciona en varias líneas).
  perl -0777 -i -pe 's/(CALL\s+sp_confirmar_despacho_api\s*\(\s*)((?:\?\s*,\s*){7}\?)(\s*,)/${1}${2}, ?${3}/s' "$F"

  # (b) La factura entre id_poliza y usuario, conservando el prefijo (p., data.).
  #     Global: además de la lista de valores, así queda declarada si el archivo
  #     desestructura el cuerpo de la petición.
  perl -0777 -i -pe 's/(([\w\$.]*)id_poliza\s*,\s*)([\w\$.]*usuario)/${1}${2}id_factura_vale, ${3}/gs' "$F"

  echo "  --- DESPUÉS ---"
  grep -n -B 2 -A 10 "CALL sp_confirmar_despacho_api" "$F" | sed 's/^/    /'

  DESPUES=$(contar_marcas "$F")
  EN_LLAMADA=$(perl -0777 -ne '
    if (/CALL\s+sp_confirmar_despacho_api.*?\][^\]]*?;/s) { print (($& =~ /id_factura_vale/) ? 1 : 0) }
    else { print 0 }' "$F")

  if ! node --check "$F" 2>/dev/null; then
    echo "  ✗ La sintaxis quedó mal. Se restaura el respaldo."
    cp "$RESPALDO" "$F"; continue
  fi
  if [ "$DESPUES" -ne 9 ]; then
    echo "  ✗ El CALL quedó con $DESPUES interrogaciones (deben ser 9). Se restaura."
    cp "$RESPALDO" "$F"; continue
  fi
  if [ "$EN_LLAMADA" != "1" ]; then
    echo "  ✗ El valor no quedó dentro de la llamada. Se restaura."
    cp "$RESPALDO" "$F"; continue
  fi

  echo "  ✓ Sintaxis OK, 9 interrogaciones, valor dentro de la llamada."

  # Si el valor quedó SIN prefijo, la variable tiene que estar declarada; con
  # prefijo (p.id_factura_vale) sale del objeto y no hace falta.
  if perl -0777 -ne 'exit(/[^.\w]id_factura_vale/s ? 0 : 1)' "$F" \
     && ! grep -qE "(const|let|var)[^=]*id_factura_vale|req\.body[^;]*id_factura_vale|id_factura_vale[^;]*req\.body" "$F"; then
    echo
    echo "  ⚠ FALTA DECLARAR la variable. Agregue id_factura_vale donde se leen"
    echo "    las demás del cuerpo de la petición:"
    grep -n "req\.body" "$F" | head -5 | sed 's/^/      /'
  else
    echo "  ✓ La variable está disponible."
  fi

  # El servicio a reiniciar sale de la ruta del archivo.
  SERVICIO=$(basename "$(dirname "$F")")
  echo
  echo "  → Reinicie:  pm2 restart $SERVICIO"
  echo "  → Deshacer:  cp $RESPALDO $F && pm2 restart $SERVICIO"
done
