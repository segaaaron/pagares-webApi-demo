# 0015. Una mensualidad, un pagaré

Fecha: 2026-09-04 · Estado: aceptada

## Contexto

El sistema documentaba una deuda con **un** pagaré: un importe, una fecha de vencimiento y
abonos libres encima. Eso cubre al prestamista de mostrador —el deudor paga cuando puede—
pero no cubre lo que se pide todos los días: «préstame sesenta mil y te pago en doce
mensualidades».

Lo que había para pactar plazos era el convenio, que tiene **una sola fecha**: sirve para
«me pagas cuarenta mil el 30 de noviembre», no para doce cuotas.

Y hay un límite que no es del sistema: **un pagaré es un título de pago único**. La Ley
General de Títulos y Operaciones de Crédito no contempla un calendario dentro del
documento. Un pagaré con doce fechas no es un pagaré con plan de pagos: es un pagaré mal
redactado.

## Decisión

**Una mensualidad, un pagaré.** Emitir con `installments: 12` crea doce títulos firmados el
mismo día, numerados «3 de 12», con el importe repartido y vencimientos mes a mes desde el
pactado. Es lo que se hace con el talonario de papel cuando se vende a plazos.

Tres reglas que sostienen el resto:

- **Las cuotas suman exactamente la deuda.** El sobrante de la división va en la primera,
  no en la última: el deudor paga el resto en cifras redondas y lo desigual queda atrás
  cuanto antes. La regla vive en `domain-rules` con sus pruebas, porque repartir dinero no
  puede estar en un caso de uso donde nadie lo mira.
- **El día se conserva al cambiar de mes**, salvo que el mes no lo tenga: el 31 de enero
  vence el 28 de febrero, no el 3 de marzo. Sin esa corrección el pagaré vencería un mes
  más tarde de lo pactado, que es un error caro y silencioso.
- **Un solo aviso por la serie.** Doce correos por una misma operación son doce
  oportunidades de que el deudor deje de leerlos.

La serie no tiene tabla propia: tres columnas en el pagaré (`seriesId`, `seriesIndex`,
`seriesSize`). El total y el plazo se leen sumando sus pagarés, y una tabla que guardara
esas cifras sería una segunda verdad que se desincroniza en cuanto se anule uno.

## Alternativas descartadas

- **Un pagaré con calendario dentro**: no existe en la ley. Documentar cuotas en las
  observaciones deja la exigibilidad en el aire.
- **Calendario dentro del convenio**: más barato de construir, pero el título sigue siendo
  uno solo con una fecha. Si el deudor falla la quinta cuota hay que esperar al vencimiento
  del todo para reclamar; con la serie se reclama **esa**, que ya venció.

## Consecuencias

La cartera crece: doce pagarés donde antes había uno, cada uno con su folio, su vencimiento
y sus recordatorios. Es el precio de que cada cuota sea exigible por su cuenta, y es lo que
hace el papel.

Los abonos libres siguen existiendo y son compatibles: cada pagaré de la serie admite pagos
parciales, que se anotan como en cualquier otro (art. 17 LGTOC).

Queda pendiente decidir qué hace la serie cuando uno de sus pagarés se renueva, se anula o
se da de baja. Hoy cada título sigue su propio camino y la serie sólo los agrupa para
mirarlos juntos, que es lo honesto mientras nadie haya pedido otra cosa.
