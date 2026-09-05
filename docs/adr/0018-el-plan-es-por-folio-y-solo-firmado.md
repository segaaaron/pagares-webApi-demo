# 0018. El plan es por folio, y sólo con el folio firmado

Fecha: 2026-09-04 · Estado: aceptada

## Contexto

Una deuda a plazos son varios pagarés (ADR 0015), y la aplicación del deudor los agrupa
para no enseñarle doce deudas donde hay una. La pregunta que faltaba: **¿desde cuándo son
un plan?**

Los doce nacen en `PENDING_SIGNATURE`. Mientras el deudor no firma uno, ese título no le
obliga: no es deuda suya, es una petición que todavía puede rechazar. Agruparlo dentro del
plan le enseñaría como aceptado algo que no ha aceptado, y le sumaría un saldo que no debe.

## Decisión

El plan se arma **por folio y sólo con el folio firmado**. Lo dictó el dueño del producto y
es la regla en las dos aplicaciones.

En `/me/notes` y `/me/notes/:id` viaja un objeto `plan` **sólo en la cuota firmada**:

    plan: { seriesId, size, signedCount, paidCount, model, total, paid, pending }

Las cifras salen únicamente de lo firmado. `size` va con el tamaño **pactado** para que la
aplicación pueda decir «1 de 3 firmados» en vez de fingir un plan de una cuota. Lo anulado y
lo renovado quedan fuera (§13.7).

Una serie a medio firmar se ve **partida**, y es lo correcto: lo firmado como plan, lo
pendiente como folios sueltos cuya única acción es firmarlos. Es exactamente lo que el
deudor ha aceptado y lo que no.

La liquidación anticipada del cliente (ADR 0017) sigue la misma regla: `GET
/me/notes/:id/early-payoff` contesta **sólo por lo firmado**. Cobrarle por las cuotas que
aún no firmó sería cobrarle por lo que todavía puede rechazar. El panel, que emite y ve la
serie entera, la sigue viendo entera.

Las cifras se calculan **en el servidor**. Sumarlas en cada aplicación era reimplementar
una cuenta de dinero en dos sitios, y la primera vez que una cambiara enseñarían números
distintos al deudor y al administrador — que es justo la llamada telefónica que nadie
quiere.

## Consecuencias

Firmar de una en una hace que el plan aparezca a trozos: se firma la primera y se ve un
pagaré suelto; se firma la segunda y aparece un plan con dos cuotas. La pantalla va
contando la deuda a plazos según se firma, que es raro de leer.

Se propuso firmar la serie de una vez, y **se descartó**: la firma es por pagaré (ADR
0021). Así que el plan a trozos no es un estado transitorio sino el definitivo, y es la
verdad de lo que el deudor ha aceptado hasta ese momento. Lo que sí exige es que la
aplicación diga cuántas firmas faltan y qué desbloquean.
