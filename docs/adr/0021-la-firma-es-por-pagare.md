# 0021. La firma digital es por pagaré

Fecha: 2026-09-05 · Estado: aceptada

## Contexto

Una deuda a plazos son varios pagarés (ADR 0015), y los doce nacen sin firma. Quedaba
decidir si el deudor los firma **uno a uno** o si una sola firma se aplica a la serie
entera, como se hace con el talonario de papel, que se firma completo en la misma mesa.

La pregunta no era cómoda, porque las dos opciones tienen coste:

- Firmar uno a uno son doce lienzos y doce envíos en el teléfono, y con la regla del ADR
  0019 —nada nuevo mientras quede algo sin firmar— quien firma once queda **bloqueado para
  cualquier operación nueva** por la que le falta.
- Firmar una vez para doce es cómodo, pero hace que un solo acto de voluntad valga por doce
  títulos ejecutivos independientes.

## Decisión

**La firma es por pagaré.** Lo decidió el dueño del producto.

Cada título se firma por separado, con su propio trazo, su propio instante y su propia
constancia. No hay endpoint de serie: `POST /notes/:id/signature` sigue siendo la única
puerta, y firma exactamente el documento que dice su ruta.

Se descartó la firma por serie —`POST /notes/series/:seriesId/signature`, que llegó a
proponerse— y no se implementó.

Detrás hay una razón que aguanta mejor que la comodidad: un pagaré es un **título ejecutivo
autónomo**. Se reclama solo, se endosa solo y se cobra solo. Que cada uno lleve la firma que
el deudor puso **en ese documento** es lo que hace que no haya nada que discutir el día que
se presente uno solo ante un juez. Una firma replicada a doce documentos por un servidor es
defendible, pero es una discusión; doce firmas no lo son.

## Consecuencias

Firmar un plan de doce cuesta doce firmas, y eso es trabajo real para el deudor. La
aplicación tiene que decírselo con todas las letras: **cuántas le faltan y para qué**, no
como aviso de fondo sino en el momento en que pide algo nuevo y no puede.

La serie se firma **a trozos**, y por eso el plan aparece a trozos (ADR 0018): lo firmado
es plan, lo pendiente son folios sueltos. No es un defecto de la pantalla; es la verdad de
lo que el deudor ha aceptado hasta ese momento.

Y se refuerza el ADR 0019: mientras queden cuotas sin firmar, a ese deudor no se le emite
nada nuevo. Es el efecto buscado —no se le apila deuda que no ha aceptado— y ahora también
el incentivo para que termine de firmar.

Queda vivo un riesgo que conviene mirar cuando haya cartera: si un deudor firma seis de
doce y abandona, el prestamista tiene seis títulos válidos y seis papeles sin valor por una
deuda que se pactó entera. La emisión no se deshace sola. Si aparece, se resuelve anulando
las no firmadas con motivo, que es lo que hoy permite el sistema.
