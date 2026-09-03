# 0006. El folio del recibo se guarda con el abono

Fecha: 2026-09-03 · Estado: aceptada

## Contexto

§17.1 le da folio propio al recibo de abono (`REC-…`). El folio se pedía a la secuencia
**en cada render**: descargar dos veces el mismo recibo daba `REC-2026-000045` y
`REC-2026-000046` para el mismo abono, inflaba la secuencia y dejaba dos documentos
distintos circulando por el mismo pago. El saldo impreso era además el de hoy, no el que
quedó tras ese abono, así que reimprimir un recibo viejo cambiaba su contenido.

## Decisión

`Payment.receiptFolio` guarda el folio, asignado la primera vez que se genera el PDF
dentro de una transacción que relee la fila. El saldo del recibo se calcula sumando los
abonos hasta ese abono inclusive.

## Alternativas descartadas

- **Asignar el folio al registrar el abono**: gasta secuencia para recibos que nadie
  descarga, y §17.1 dice que el documento se genera al pedirlo.
- **Usar el folio del pagaré**: dos documentos distintos con el mismo identificador; el
  correo 15 anunciaba un `PAG-…` y adjuntaba un `REC-…`.

## Consecuencias

Un recibo es el mismo documento cada vez que se descarga, que es lo que un comprobante
tiene que ser. La secuencia deja de tener huecos. Revertirlo exige decidir qué se hace con
los folios ya emitidos, porque están en manos de los clientes.
