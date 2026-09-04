# 0017. Liquidar antes de tiempo

Fecha: 2026-09-04 · Estado: aceptada

## Contexto

El ADR 0016 dejó los planes con interés ordinario dentro de cada cuota, y dejó fuera una
pregunta que el deudor hace por teléfono en cuanto junta dinero: **«¿cuánto es si lo pago
todo hoy?»**.

Contestarla de memoria es como se sostienen después números equivocados. Y no hay una sola
respuesta honesta, porque depende de cómo se pactó el interés:

- Sobre **saldos insolutos** el interés es el precio del tiempo. Si el dinero vuelve antes,
  ese tiempo no transcurre y ese interés no se causa: no se cobra.
- Sobre **saldo global** el interés se pactó de una vez sobre el importe original.
  Adelantar no lo baja. No es un descuido: es lo que se firmó.

## Decisión

`settleEarly` en `domain-rules` contesta la pregunta, y `GET /admin/notes/:id/early-payoff`
la expone. Preguntar desde cualquier pagaré de la serie contesta **por la serie entera**:
liquidar es saldar la deuda, no una cuota.

Tres reglas que no son obvias y por eso se escriben:

1. **La cuota ya vencida se debe entera**, interés incluido: su tiempo ya transcurrió.
   Sólo se perdona el interés de las cuotas futuras, y sólo sobre saldos insolutos.
2. **Lo abonado se imputa primero a intereses y después a capital** (art. 2094 CCF). Con
   otra imputación el capital bajaría más rápido de lo que corresponde y la cuenta no
   cuadraría con la de un juez.
3. **El moratorio se suma aparte y no se perdona.** No es precio del préstamo sino sanción
   por los días de atraso ya corridos, y pagar hoy no los devuelve (§12.3).

La pantalla enseña las dos cifras juntas —lo que paga hoy y lo que pagaría siguiendo el
calendario— porque el ahorro sólo se entiende contra algo. Cuando el plan es global lo dice
con todas sus letras, en vez de insinuar un descuento que no existe.

## Alternativas

- **Perdonar también el interés global**, por parecer generoso. Sería cobrar distinto de lo
  firmado y, sobre todo, dejar la pantalla mintiendo sobre qué se pactó. Si el prestamista
  quiere hacerle un descuento, ya existe la condonación, que queda registrada con motivo y
  actor (§12.2).
- **Congelar la cifra al consultarla.** No: el interés corre por día natural, y una cifra
  guardada envejece mal. Es una consulta, y otro día da otro número.
- **Repartir el interés del mes en curso por días.** Se descartó por ahora: parte el
  criterio de «la cuota vencida se debe entera» en dos, y el error a favor del deudor es de
  centavos frente al ruido que añade explicarlo.

## Consecuencias

Liquidar sigue siendo registrar abonos contra los pagarés que toquen: esto **no** cobra ni
cambia estados, contesta cuánto. Cuando el administrador registre el pago, lo hará por la
cifra que la pantalla acaba de darle.

Queda fuera: aplicar la liquidación de un golpe —un botón que salde la serie entera con un
solo movimiento—. Hoy son doce abonos, uno por título, que es lo que dice el libro de
abonos (§12.2). Si se pide, se decide entonces.
