# Cambio pendiente en `combustible-api`: pasar la factura al procedimiento

## El error que sale hoy

Al confirmar un vale desde «Confirmación de Vales»:

```
Incorrect number of arguments for PROCEDURE app_transporte.sp_confirmar_despacho_api;
expected 13, got 12
```

## Por qué

El procedimiento `sp_confirmar_despacho_api` se corrigió para recibir la factura
que el usuario elige en pantalla. Pasó de 8 a **9 parámetros de entrada**, con
`p_id_factura_vale` en la **posición 8** (después de `p_id_poliza`, antes de
`p_usuario`).

La cuenta del error: **13 = 9 de entrada + 4 de salida**. Que lleguen **12**
significa que el `CALL` va con **8 de entrada**, o sea sin la factura.

La cadena completa es:

```
pantalla  →  back-transporte  →  combustible-api  →  procedimiento
```

Los tres primeros eslabones ya están al día:

| Eslabón | Estado |
|---|---|
| Pantalla | manda `id_factura_vale` en el cuerpo ✅ |
| back-transporte | lo valida y lo reenvía a `combustible-api` ✅ |
| **combustible-api** | **sigue llamando al procedimiento con 8 parámetros** ❌ |
| Procedimiento | ya tiene los 9 ✅ |

## Qué hay que cambiar

`combustible-api` recibe en el cuerpo de `POST /api/confirmar-despacho` un campo
`id_factura_vale`. Hay que pasarlo al `CALL` como octavo argumento.

### Encontrar la línea

```bash
pm2 show combustible-api | grep -i "script path"
grep -rn "sp_confirmar_despacho_api" /ruta/de/combustible-api --include=*.js
```

### El cambio

Antes (8 de entrada + 4 de salida = 12):

```js
await conn.query(
  'CALL sp_confirmar_despacho_api(?,?,?,?,?,?,?,?,@d1,@d2,@cruce,@msg)',
  [api_id, id_piloto, id_camion, id_transportista,
   id_producto, id_bomba, id_poliza, usuario]
);
```

Después (9 de entrada + 4 de salida = 13):

```js
await conn.query(
  'CALL sp_confirmar_despacho_api(?,?,?,?,?,?,?,?,?,@d1,@d2,@cruce,@msg)',
  [api_id, id_piloto, id_camion, id_transportista,
   id_producto, id_bomba, id_poliza,
   id_factura_vale,   // <-- NUEVO, en la posición 8
   usuario]
);
```

Dos detalles que suelen fallar:

1. **Una interrogación más** en la cadena del `CALL`. Si solo se agrega el valor
   al arreglo y no la marca, el error persiste.
2. `id_factura_vale` es el **`codigo`** de `man_facturas_vales` (un entero), no
   el número de factura en texto (`C-0164645436`).

Después: `pm2 restart combustible-api`.

## Cómo comprobar que quedó

1. En «Confirmar vale», elegir a propósito una factura que **no** sea la que se
   venía cobrando.
2. Confirmar.
3. Revisar contra qué factura quedó:

```bash
mysql -u Admins -p app_transporte -e "SELECT d.correlativo, d.num_vale, d.fecha_hora_graba, d.id_factura_vale, f.factura, d.cantidad, d.total FROM pro_detalle_facturas d LEFT JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale WHERE d.id_api_origen IS NOT NULL ORDER BY d.correlativo DESC LIMIT 3;"
```

La fila de arriba debe traer el `id_factura_vale` que se eligió. Y el saldo de
esa factura —y solo de esa— debe haber bajado los galones del despacho.

## Mientras tanto

`back-transporte` ya traduce el error: en vez del texto de MySQL, la pantalla
muestra qué falta y dónde. La confirmación se rechaza completa, así que **no
queda ningún vale a medias ni se mueve ningún saldo**.
