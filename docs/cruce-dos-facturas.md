# Confirmación de Vales: un vale cobrado a dos facturas (cruce)

## El problema

Cuando a la factura en uso le quedaba menos combustible que el del vale del API,
la pantalla mostraba esto y el botón CONFIRMAR quedaba apagado:

> Esta factura tiene **37.89 gal** disponibles y el vale requiere **42.00 gal**.
> La factura no puede quedar en negativo.

No había salida: la factura siguiente ya estaba registrada, pero el vale no se
podía confirmar contra las dos. El vale quedaba trabado.

## Cómo queda

El vale se reparte entre dos facturas:

| Factura | Galones | Queda |
|---|---|---|
| C-16993491 (la elegida) | 37.89 | saldo **0**, estado **LIQUIDADO** |
| C-1634422046 (la siguiente) | 4.11 | empieza a rebajarse |

Se graban **dos filas en `pro_detalle_facturas` con el mismo número de vale**,
una por factura. Ninguna queda en negativo y los dos tramos suman exactamente
los galones del despacho. Cada tramo se cobra al precio de **su** factura.

El modal muestra el reparto **antes** de confirmar, así que se ve contra qué se
va a cobrar y por cuánto.

## Qué factura recibe el resto

La más antigua que lo cubra, entre las que son de la **misma bomba y el mismo
producto**, están **ACTIVO**, no son la elegida y tienen **saldo suficiente para
el resto**. Es FIFO: se termina una factura antes de abrir la siguiente.

Si ninguna alcanza, la confirmación se rechaza **completa**: el vale sigue
Pendiente, no se graba ningún vale a medias y no se mueve ningún saldo. El
mensaje dice cuántos galones hacen falta.

Sólo se cruzan **dos** facturas. Un vale que necesitara tres se rechaza.

## Qué se cambió

| Pieza | Cambio |
|---|---|
| `sql/cruce_dos_facturas_confirmacion.sql` | **nuevo** — `sp_confirmar_despacho_api` con el reparto |
| `sql/evitar_saldo_negativo_confirmacion.sql` | superado, marcado NO EJECUTAR (revierte el cruce) |
| `sql/control_captura_api.sql` | ya no define el SP (había dos copias y se desincronizaron); agrega `pro_detalle_facturas.estado` que ya tenía el servidor |
| `src/services/controlApi.service.js` | en vez de rechazar, calcula el reparto; sólo rechaza si ninguna factura cubre el resto |
| `pages/controlapi/ConfirmacionValesPage.jsx` | muestra el reparto y habilita CONFIRMAR |

**La firma del procedimiento no cambió**: sigue con 9 parámetros de entrada y 4
de salida (13 argumentos). **`combustible-api` no necesita ningún cambio.**

## Para desplegar

En el servidor, dentro de `back-transporte`:

```bash
node scripts/setup-db.js cruce_dos_facturas_confirmacion.sql
```

Luego el backend y el front como siempre (`pm2 restart` del backend y subir el
build del front). `combustible-api` se queda como está.

## Para comprobar que quedó

```bash
mysql -u Admins -p app_transporte -e "
SELECT d.correlativo, d.num_vale, f.factura, d.cantidad, d.total, f.saldo, f.estado
  FROM pro_detalle_facturas d
  JOIN man_facturas_vales f ON f.codigo = d.id_factura_vale
 WHERE d.id_api_origen = (SELECT MAX(api_id) FROM control_captura_api WHERE api_estado='C')
 ORDER BY d.correlativo;"
```

Un vale cruzado sale en **dos filas con el mismo `num_vale`**: la primera deja
su factura en `saldo 0 / LIQUIDADO` y la segunda rebaja la siguiente.

## Lo que falta confirmar en el servidor

El PDF y el correo los arma `combustible-api`, no este backend. Con un vale
cruzado hay **dos** vales generados, y ese servicio recibe los dos ids
(`p_id_detalle_1` y `p_id_detalle_2`) más `p_hubo_cruce`. Hay que ver en el
primer cruce real si el correo sale con los dos vales o sólo con el primero; si
sale sólo uno, el arreglo es en `combustible-api` (usar también `@d2`).

La **reimpresión desde la pantalla** sí imprime los dos: busca por
`id_api_origen` y recorre todas las filas.

## Probado

Contra la base local (MariaDB 10.4), con `sp_confirmar_despacho_api` instalado
desde este mismo archivo:

- **Cruce** — vale de 42.00 con factura de 37.89: dos filas (37.89 + 4.11), el
  mismo `num_vale`, la primera factura en 0/LIQUIDADO, la segunda rebajada, el
  vale marcado `C` y `api_id_detalle_fact` apuntando a la primera fila.
- **Sin cruce** — el vale cabe completo: una sola fila y el saldo rebajado.
- **Sin segunda factura** — se rechaza con mensaje claro, el vale sigue `P`, sin
  filas a medias y sin mover saldos.
