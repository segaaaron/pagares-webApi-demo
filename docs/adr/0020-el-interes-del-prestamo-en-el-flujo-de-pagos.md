# 0020. El interés del préstamo entra en el flujo de pagos

Fecha: 2026-09-05 · Estado: aceptada

## Contexto

Desde el ADR 0016 la cuota de un plan lleva dentro el **interés ordinario**: el precio del
préstamo. Pero el flujo de abonos nunca se enteró, y eso produjo tres defectos que sólo se
ven al mirar juntos el recibo, los reportes y la ley.

**El recibo mentía.** `register-payment` calculaba el interés como `accrueInterest(...días
de atraso)`, es decir **sólo moratorio**. Una cuota al corriente devenga cero, así que un
abono de $6,027.73 se registraba entero «a capital» aunque $1,800 fueran el precio del
préstamo. El recibo es el documento con el que el deudor verifica lo que pagó.

**Los reportes escondían la ganancia.** «Interés cobrado» sumaba `appliedToInterestCents`,
que era sólo la sanción por atraso. Los $12,332.69 que gana quien presta en un plan de
$60,000 a doce meses se contaban como capital devuelto: la ganancia no aparecía en ningún
renglón.

**Y se cobraba interés sobre interés.** El moratorio corría sobre `amountCents − paidCents`,
y ese saldo es la cuota entera, con su interés ordinario dentro. El art. 363 del Código de
Comercio dice que *los intereses vencidos y no pagados no devengarán intereses*, salvo que
se pacte capitalizarlos. La jurisprudencia añade que ordinario y moratorio se analizan por
separado, sin sumarse, porque su causa y naturaleza son distintas.

## Decisión

**Tres conceptos, no dos.** El abono se reparte en moratorio, interés ordinario y capital, y
cada uno se guarda en su columna. El orden —los dos intereses antes que el capital, el
moratorio primero— es el del art. 2094 del Código Civil Federal; lo contrario dejaría
intereses vivos mientras baja el capital. `Payment.appliedToOrdinaryInterestCents` es la
columna nueva; las dos anteriores no cambian de significado.

**El moratorio corre sólo sobre el capital.** Es el valor por omisión, en
`lateInterestOverPrincipalOnly`. Quien tenga pacto de capitalizar intereses lo apaga en
Ajustes, y entonces es una decisión escrita y no un descuido del cálculo. La regla vive en
`lateInterestBase` (dominio) y la usan los cuatro sitios que calculan mora —abono, detalle,
simulador y liquidación anticipada—, porque cuatro cifras que deberían coincidir no pueden
salir de cuatro fórmulas.

**El desglose se enseña.** El detalle del pagaré, en el panel y en la aplicación del deudor,
dice de qué está hecha la cuota: cuánto es precio del préstamo, cuánto capital y cuánto de
ese precio queda por cubrir. Estaba guardado desde que se emite; sólo no salía.

**Y se separa donde se cuenta**: recibo en PDF, correo del recibo, informe de recuperación y
póliza contable llevan los dos intereses en renglones distintos. En la póliza son dos
columnas: no se contabilizan igual, y sumarlas obliga a deshacerlo a mano.

## Alternativas

- **Deducir el interés del importe pagado**, sin columna nueva. Es lo que hacía la
  liquidación anticipada, y funciona mientras nadie revierta un abono. El dato escrito no
  se puede desincronizar; la deducción sí.
- **Cobrar mora sobre la cuota entera y ya**. Es más simple y es lo que hace media plaza,
  pero es exactamente lo que el 363 prohíbe sin pacto. Queda disponible como opción, no
  como omisión.
- **Un solo renglón de «intereses»** en reportes. Junta el precio del préstamo con la
  sanción por atraso: son de naturaleza distinta y el contador acaba separándolos a mano.

## Consecuencias

**El moratorio de los pagarés con plan baja**, y a favor del deudor. Los pagarés sueltos no
cambian en nada: no llevan interés dentro, así que su base sigue siendo el saldo entero. La
cartera anterior a los planes no se toca.

El contrato de `/me/*` gana un campo (`appliedToOrdinaryInterest`) y el detalle otro
(`breakdown`). Se avisó a la aplicación antes de desplegar: un campo nuevo que se ignora
deja un reparto que no suma, y el deudor lo ve.

La condonación del remanente (§25.16) sigue registrándose como capital condonado. Está
acotada por la tolerancia —son unos pesos para cerrar—, así que separarla añadiría ruido sin
cambiar ninguna cifra que alguien mire.

Los abonos anteriores a este cambio se quedan como están: su reparto era el correcto según
la regla de entonces, y reescribir el libro de abonos sería justo lo que §12.2 prohíbe.
