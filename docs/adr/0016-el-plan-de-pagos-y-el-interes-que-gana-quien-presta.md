# 0016. El plan de pagos, y el interés que gana quien presta

Fecha: 2026-09-04 · Estado: aceptada

## Contexto

El ADR 0015 dejó las deudas a plazos documentadas como una serie de pagarés, pero repartía
sólo el capital: doce de cinco mil para una deuda de sesenta mil. Faltaba lo que hace que
prestar tenga sentido para quien presta — **el interés ordinario**, que es el precio del
préstamo desde que entrega el dinero hasta que se lo devuelven.

No hay que confundirlo con el moratorio de §12.3: aquél es la sanción por pagar tarde y
corre después del vencimiento. Son dos cosas distintas y se pactan por separado.

Banxico distingue dos formas de calcular el ordinario en un préstamo a plazos, y la
diferencia no es de matiz:

- **Saldos insolutos**: cada mes se calcula sobre lo que aún se debe. Abonar baja el
  interés siguiente.
- **Saldo global**: siempre sobre el importe original, aunque ya se haya pagado la mitad.
  Abonar no reduce nada.

En el ejemplo del propio Banxico, con la misma tasa nominal, saldos insolutos dan **77.1 %
de CAT** y saldo global **147 %**: el costo casi se duplica.

## Decisión

Se implementan las dos, porque las dos se usan en la calle, y se nombran por lo que son.
`INSOLUTOS` sale recomendado en la pantalla; `GLOBAL` se puede elegir y **avisa** de que
con la misma tasa el costo real puede casi duplicarse.

- Las cuotas se calculan con el sistema francés cuando es sobre saldos insolutos: cuota
  fija, interés decreciente, capital creciente.
- La aritmética es entera, en centavos. El factor de la anualidad —que es una potencia—
  se calcula en coma flotante y **sólo** para fijar la cuota; la tabla se arma con enteros
  y la última cuota cancela el resto, así que el capital suma el préstamo exacto y el saldo
  cierra en cero.
- El desglose de cada cuota —cuánto es interés y cuánto capital— se **guarda** con el
  pagaré. Es lo que se pactó: recalcularlo mañana con la tasa de entonces daría otra cifra.
- El formulario enseña la tabla completa antes de emitir, calculada con **la misma función**
  que usará el servidor. Lo que se ve es lo que se firma.

## Alternativas descartadas

- **Sólo saldos insolutos**: sería honesto pero mentiría sobre el mercado. Quien presta con
  interés global lo seguiría haciendo, calculándolo a mano y sin que el sistema lo registre.
- **Sólo global**, por ser el más simple de explicar: es el más caro para el deudor, y
  ponerlo por omisión sería empujar a la opción peor sin decirlo.
- **Un CAT calculado**: el CAT tiene una fórmula oficial e incluye comisiones y seguros que
  este sistema no modela. Enseñar una cifra llamada CAT que no lo es sería peor que no
  enseñarla; se muestran el total a pagar y la ganancia, que aquí son exactos.

## Consecuencias

Un pagaré de una serie ya no vale «su parte del capital»: vale **su cuota**, que incluye
interés. El importe del título dice lo que hay que pagar ese mes, que es lo correcto, pero
sumar los doce ya no da el préstamo sino el préstamo más el precio.

El moratorio sigue corriendo aparte y sólo sobre la cuota que se pague tarde.

Queda fuera, y a propósito: el pago anticipado. Si el deudor liquida antes de tiempo, sobre
saldos insolutos debería ahorrarse el interés futuro y sobre global no. Hoy el sistema no
recalcula nada: se registra el abono contra el pagaré que toque. Cuando alguien lo pida,
se decide entonces y con su propio ADR.
