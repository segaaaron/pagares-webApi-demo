# 0010. Condonar el remanente para cerrar un pagaré

Fecha: 2026-09-04 · Estado: aceptada

## Contexto

El deudor consulta su saldo el lunes y transfiere el jueves. El interés moratorio del
art. 174 corre por día natural, así que para cuando el dinero llega faltan unos pesos:
en un pagaré de $45,000 al 36% anual, unos $45 por día, de $45 a $135 en el caso típico.

Hasta ahora ese pagaré quedaba **abierto para siempre** por una cantidad que nadie iba a
cobrar. Peor que quedarse: seguía sumando interés sobre el remanente, entraba en cartera
vencida, disparaba recordatorios y ensuciaba la clasificación. Con el pago desde la
aplicación —donde el deudor ve una cifra un día y transfiere otro— esto deja de ser un
caso raro y pasa a ser el caso normal.

El plan no lo contempla: §13.4 tiene convenios con quita, pero una quita es un acuerdo
negociado con confirmación escrita del folio (§24.5), y pedir eso para cerrar por ciento
cincuenta pesos garantiza que nadie lo haga.

## Decisión

`OrganizationSettings.settlementToleranceCents` fija hasta cuánto se puede condonar.
Vale **0 por defecto**: sin configurarlo, la función no existe.

Cuando el saldo cabe dentro de ese límite, el detalle del pagaré ofrece cerrarlo. El
administrador escribe un motivo y confirma; `POST /admin/notes/:id/forgive-remainder`
vuelve a comprobar el límite en el servidor —con bloqueo de fila, por si entra un abono
mientras se decide— y asienta el remanente en el **libro de abonos** con `isWaiver`.

Tres consecuencias de que sea un asiento del libro y no un campo aparte:

- El saldo sigue siendo la suma de sus filas, así que el cuadre de §22.5 no empieza a
  marcar descuadres que no lo son.
- El estado se deriva solo: `paidCents` alcanza el importe y el pagaré pasa a `PAID`.
- El deudor recibe su carta de finiquito por el mismo camino que si hubiera pagado, que
  es lo correcto: para él, la deuda quedó saldada.

`isWaiver` **se excluye de todo lo que cuenta caja** —cobrado del día, flujo mensual,
recuperación de castigos— y aparece en su propio renglón del reporte de recuperación,
como pérdida. Se marca también en la aplicación del cliente: un abono que no coincide con
lo que el deudor transfirió, sin explicación, se lee como un error del sistema.

## Alternativas descartadas

- **Liquidar automáticamente al caer dentro del umbral.** Un pagaré marcado como pagado
  sin haberlo sido no se ve en ningún reporte; un saldo de doscientos pesos sí. El
  umbral dice hasta cuánto se *puede* condonar; condonar lo hace una persona.
- **`forgivenCents` en el pagaré, fuera del libro.** Habría obligado a cambiar el cálculo
  del saldo en las veinte y pico consultas que hoy hacen `amountCents - paidCents`, y a
  enseñar al cuadre de saldos a distinguir un descuadre real de este. Un asiento marcado
  cuesta una columna.
- **Un método de pago nuevo (`WAIVER`).** El método describe *cómo llegó el dinero*, y
  aquí no llegó ninguno. Además obliga a revisar cada `switch` sobre el enum.
- **Usar un convenio con quita.** Es la herramienta correcta para perdonar una parte
  negociada de la deuda, y sigue siéndolo por encima del umbral. Para ciento cincuenta
  pesos, su fricción —confirmación escrita del folio, vigencia, seguimiento— asegura que
  no se use.

## Consecuencias

El límite superior está topado a $1,000.00 en el esquema de validación: por encima de eso
la decisión deja de ser operativa y vuelve a ser un convenio. Revertir esto exige decidir
qué se hace con los pagarés ya cerrados por esta vía, que constan como `PAID` frente al
deudor y tienen su carta de finiquito emitida.
