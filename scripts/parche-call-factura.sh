#!/bin/bash
# ---------------------------------------------------------------------------
# Agrega la factura elegida a la llamada de sp_confirmar_despacho_api.
#
# El procedimiento pasó de 8 a 9 parámetros de entrada (p_id_factura_vale en la
# posición 8). Quien ejecuta el CALL sigue mandando 8, y por eso MySQL responde
# "expected 13, got 12".
#
# Busca el archivo, saca respaldo, aplica los cambios y valida. Si algo no
# calza, restaura el respaldo: nunca deja el archivo a medias.
#
# Todo se procesa sobre el archivo COMPLETO y no línea por línea, porque tanto
# el CALL como la lectura del cuerpo de la petición suelen abarcar varias
# líneas y un grep por línea no las ve enteras.
# ---------------------------------------------------------------------------
set -u

# Interrogaciones DENTRO de la llamada.
contar_marcas() {
  perl -0777 -ne '
    if (/CALL\s+sp_confirmar_despacho_api\s*\((.*?)\)/s) {
      my $d = $1; my $n = () = $d =~ /\?/g; print $n;
    } else { print 0 }' "$1"
}

# ¿Aparece id_factura_vale ANTES del CALL? Es decir, ¿ya está disponible?
declarada_antes() {
  perl -0777 -ne '
    my ($pre) = split /CALL\s+sp_confirmar_despacho_api/, $_, 2;
    print(($pre =~ /id_factura_vale/) ? 1 : 0)' "$1"
}

# ¿El valor va con prefijo (p.id_factura_vale)? Entonces sale de ese objeto y
# no hace falta declarar nada.
usa_prefijo() {
  perl -0777 -ne '
    if (/CALL\s+sp_confirmar_despacho_api.*?\][^\]]*?;/s) {
      print(($& =~ /[\w\$]\.id_factura_vale/) ? 1 : 0);
    } else { print 0 }' "$1"
}

# ¿El valor quedó dentro de la lista de la llamada?
valor_en_llamada() {
  perl -0777 -ne '
    if (/CALL\s+sp_confirmar_despacho_api.*?\][^\]]*?;/s) {
      print(($& =~ /id_factura_vale/) ? 1 : 0);
    } else { print 0 }' "$1"
}

echo "=== 1. Buscando quién ejecuta el CALL ==="
# Solo archivos con la SENTENCIA, no con una mención en un comentario. Queda
# fuera back-transporte: ese no ejecuta el CALL, se lo pide por HTTP a este.
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
  FALTA_DECL=0
  if [ "$(usa_prefijo "$F")" != "1" ] && [ "$(declarada_antes "$F")" != "1" ]; then
    FALTA_DECL=1
  fi

  # Un intento anterior pudo dejar el CALL con sus 9 interrogaciones pero sin
  # declarar la variable. En ese caso hay que completar, no saltarse el archivo.
  if [ "$ANTES" -ge 9 ] && [ "$FALTA_DECL" -eq 0 ]; then
    echo "  Ya está completo: 9 interrogaciones y la variable disponible."
    continue
  fi
  if [ "$ANTES" -ge 9 ]; then
    echo "  El CALL ya tiene 9 interrogaciones, pero FALTA declarar la variable."
  else
    echo "  Interrogaciones actuales: $ANTES"
  fi

  RESPALDO="$F.bak-$(date +%F-%H%M%S)"
  cp "$F" "$RESPALDO"
  echo "  Respaldo: $RESPALDO"

  echo "  --- ANTES ---"
  grep -n -B 2 -A 10 "CALL sp_confirmar_despacho_api" "$F" | sed 's/^/    /'

  # (a) Una interrogación más dentro del CALL. Solo si aún faltan.
  [ "$ANTES" -lt 9 ] && perl -0777 -i -pe 's/(CALL\s+sp_confirmar_despacho_api\s*\(\s*)((?:\?\s*,\s*){7}\?)(\s*,)/${1}${2}, ?${3}/s' "$F"

  # (b) La factura entre id_poliza y usuario, conservando el prefijo (p., data.).
  #     Global a propósito: así toca la lista de valores del CALL y también la
  #     lectura del cuerpo de la petición, si tiene esa misma forma.
  [ "$(valor_en_llamada "$F")" != "1" ] && perl -0777 -i -pe 's/(([\w\$.]*)id_poliza\s*,\s*)([\w\$.]*usuario)/${1}${2}id_factura_vale, ${3}/gs' "$F"

  # (c) Si tras (b) la variable sigue sin estar disponible antes del CALL, se
  #     agrega después de `usuario` en la lectura del cuerpo. Se pone DESPUÉS
  #     porque `usuario` suele ser el último y puede no llevar coma.
  if [ "$(usa_prefijo "$F")" != "1" ] && [ "$(declarada_antes "$F")" != "1" ]; then
    perl -0777 -i -pe '
      my ($pre, $post) = split /CALL\s+sp_confirmar_despacho_api/, $_, 2;
      if (defined $post) {
        $pre =~ s/(.*\busuario\b),?(\s*\}\s*=\s*req\.body)/$1, id_factura_vale$2/s;
        $_ = $pre . "CALL sp_confirmar_despacho_api" . $post;
      }' "$F"
  fi

  echo "  --- DESPUÉS ---"
  grep -n -B 2 -A 10 "CALL sp_confirmar_despacho_api" "$F" | sed 's/^/    /'

  # ---- Comprobaciones. Si alguna falla, se restaura y no se toca nada. ----
  if ! node --check "$F" 2>/dev/null; then
    echo "  ✗ La sintaxis quedó mal. Se restaura el respaldo."
    cp "$RESPALDO" "$F"; continue
  fi
  DESPUES=$(contar_marcas "$F")
  if [ "$DESPUES" -ne 9 ]; then
    echo "  ✗ El CALL quedó con $DESPUES interrogaciones (deben ser 9). Se restaura."
    cp "$RESPALDO" "$F"; continue
  fi
  if [ "$(valor_en_llamada "$F")" != "1" ]; then
    echo "  ✗ El valor no quedó dentro de la llamada. Se restaura."
    cp "$RESPALDO" "$F"; continue
  fi
  if [ "$(usa_prefijo "$F")" != "1" ] && [ "$(declarada_antes "$F")" != "1" ]; then
    echo "  ✗ La variable no quedó disponible antes del CALL. Se restaura."
    cp "$RESPALDO" "$F"
    echo "    Agréguela a mano donde se lee el cuerpo de la petición:"
    grep -n "req\.body" "$F" | head -5 | sed 's/^/      /'
    continue
  fi

  echo "  ✓ Sintaxis OK · 9 interrogaciones · valor en la llamada · variable disponible."

  SERVICIO=$(basename "$(dirname "$F")")
  echo
  echo "  → Reinicie:  pm2 restart $SERVICIO"
  echo "  → Deshacer:  cp $RESPALDO $F && pm2 restart $SERVICIO"
done
