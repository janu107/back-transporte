#!/bin/bash
# ---------------------------------------------------------------------------
# Agrega la factura elegida a la llamada de sp_confirmar_despacho_api.
#
# El procedimiento pasó de 8 a 9 parámetros de entrada (p_id_factura_vale en la
# posición 8). Quien ejecuta el CALL sigue mandando 8, y por eso MySQL responde
# "expected 13, got 12".
#
# El script busca el archivo, saca copia, aplica los dos cambios y valida la
# sintaxis. Si algo no calza, avisa y no toca nada.
# ---------------------------------------------------------------------------
set -u

echo "=== 1. Buscando quién ejecuta el CALL ==="
ARCHIVOS=$(grep -rl "sp_confirmar_despacho_api" \
  /opt /home/apps /srv /var/www 2>/dev/null \
  --include='*.js' --include='*.mjs' --include='*.cjs' --include='*.ts' \
  --exclude-dir=node_modules --exclude-dir=.git \
  | xargs -r grep -l "CALL" 2>/dev/null)

if [ -z "$ARCHIVOS" ]; then
  echo "No se encontró ningún archivo con el CALL."
  echo "Pruebe ampliando la búsqueda:"
  echo "  grep -rn 'sp_confirmar_despacho_api' / --exclude-dir={node_modules,.git,proc,sys} 2>/dev/null"
  exit 1
fi

echo "$ARCHIVOS" | sed 's/^/  /'
echo

for F in $ARCHIVOS; do
  echo "=== 2. $F ==="

  # ¿Ya está corregido? Se mira el CALL, no el archivo: la variable puede estar
  # declarada arriba y aun así faltar en la llamada.
  MARCAS_ANTES=$(grep -o "sp_confirmar_despacho_api([^)]*" "$F" | grep -o '?' | wc -l)
  if [ "$MARCAS_ANTES" -ge 9 ]; then
    echo "  El CALL ya lleva $MARCAS_ANTES interrogaciones. Se deja como está."
    grep -n -A 12 "CALL sp_confirmar_despacho_api" "$F" | sed 's/^/    /'
    continue
  fi

  RESPALDO="$F.bak-$(date +%F-%H%M%S)"
  cp "$F" "$RESPALDO"
  echo "  Respaldo: $RESPALDO"

  echo "  --- ANTES ---"
  grep -n -B 2 -A 12 "CALL sp_confirmar_despacho_api" "$F" | sed 's/^/    /'

  # (a) Una interrogación más en el CALL.
  perl -0777 -i -pe 's/(sp_confirmar_despacho_api\(\s*)((?:\?\s*,\s*){7}\?)(\s*,)/${1}${2},?${3}/s' "$F"

  # (b) La factura entre id_poliza y usuario, conservando el prefijo (p., data., ...).
  #     GLOBAL a propósito: además de la lista de valores del CALL, así queda
  #     declarada si el archivo desestructura el cuerpo de la petición.
  perl -0777 -i -pe 's/(([\w\$.]*)id_poliza\s*,\s*)([\w\$.]*usuario)/${1}${2}id_factura_vale, ${3}/gs' "$F"

  echo "  --- DESPUÉS ---"
  grep -n -B 2 -A 12 "CALL sp_confirmar_despacho_api" "$F" | sed 's/^/    /'

  # Comprobaciones antes de dar por bueno el cambio.
  MARCAS=$(grep -o "sp_confirmar_despacho_api([^)]*" "$F" | grep -o '?' | wc -l)
  TIENE_VALOR=$(grep -c "id_factura_vale" "$F")

  if ! node --check "$F" 2>/dev/null; then
    echo "  ✗ La sintaxis quedó mal. Se restaura el respaldo."
    cp "$RESPALDO" "$F"
    continue
  fi
  if [ "$MARCAS" -ne 9 ]; then
    echo "  ✗ El CALL quedó con $MARCAS interrogaciones (deben ser 9). Se restaura."
    cp "$RESPALDO" "$F"
    continue
  fi
  # Lo que de verdad importa: el valor tiene que quedar DENTRO de la sentencia
  # del CALL, no en cualquier otra parte del archivo.
  BLOQUE=$(awk '/CALL sp_confirmar_despacho_api/,/\);/' "$F")
  if [ "$TIENE_VALOR" -eq 0 ] || ! echo "$BLOQUE" | grep -q "id_factura_vale"; then
    echo "  ✗ El valor no quedó dentro de la llamada. Se restaura."
    cp "$RESPALDO" "$F"
    continue
  fi

  echo "  ✓ Sintaxis OK, 9 interrogaciones, valor insertado."

  # Si el valor quedó SIN prefijo (id_factura_vale a secas), la variable tiene que
  # estar declarada; si no, al ejecutar reventaría con "is not defined". Con
  # prefijo (p.id_factura_vale) sale del objeto y no hace falta declararla.
  # Se busca la DECLARACIÓN (const/let/var o lectura del cuerpo), no cualquier
  # aparición: la línea recién insertada también contiene el nombre.
  if grep -qE "[^.[:alnum:]_]id_factura_vale" "$F" \
     && ! grep -qE "(const|let|var)[^=]*id_factura_vale|req\.body[^;]*id_factura_vale|id_factura_vale[^;]*req\.body" "$F"; then
    echo
    echo "  ⚠ FALTA DECLARAR la variable. Agregue id_factura_vale donde se leen"
    echo "    las demás del cuerpo de la petición:"
    grep -n "req.body\|req\.body" "$F" | head -5 | sed 's/^/      /'
  else
    echo "  ✓ La variable está disponible."
  fi
done

echo
echo "=== 3. Si todo se ve bien, reinicie el servicio ==="
echo "  pm2 restart combustible-api"
echo
echo "=== Para deshacer ==="
echo "  cp <archivo>.bak-FECHA <archivo> && pm2 restart combustible-api"
