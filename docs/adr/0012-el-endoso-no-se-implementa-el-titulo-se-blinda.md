# 0012. El endoso no se implementa; el título se puede blindar

Fecha: 2026-09-04 · Estado: aceptada

## Contexto

El equipo de la aplicación propuso un módulo de endoso: modelar la transmisión del pagaré
a un tercero, con su cadena de endosatarios y un estado `ENDORSED`.

El endoso no aparece en `PLAN.md`. La regla del repositorio dice que lo que no está en el
plan se pregunta antes de inventarlo, así que la pregunta se hizo: **¿esta herramienta va
a transmitir pagarés a terceros?**

La respuesta que da el propio producto es no. Quien lo usa presta su dinero, emite el
pagaré, lo cobra y lo custodia. No hay endosatario en ninguna pantalla, ningún reporte
mide cartera cedida, y el modelo de acceso —un administrador, deudores con cuenta— no
tiene sitio para un tercero tenedor. Un módulo de endoso sería código sin usuario.

Pero al investigarlo apareció lo contrario, que sí importa: **todos los pagarés se emiten
"a la orden"**. Es la forma clásica, y es lo que el documento dice hoy, literalmente:
«Debo(emos) y pagaré(mos) incondicionalmente **a la orden de** …». Un título a la orden
circula por endoso, y eso significa que quien lo tenga físicamente en la mano puede
transmitirlo. Frente a un endosatario de buena fe, el suscriptor pierde las defensas que
tenía contra el acreedor original.

Para quien nunca va a transmitirlo, esa propiedad no aporta nada y sí abre un riesgo: un
pagaré extraviado o robado puede acabar cobrándolo alguien más. Y el riesgo es real en
este sistema, porque el documento en papel se guarda —por eso existe la bitácora de
custodia de §13.6—.

## Decisión

No se implementa el endoso. Se añade la posibilidad de emitir el pagaré **"no a la
orden"** (art. 25 LGTOC), que es lo que un prestamista en esta posición quiere de verdad.

- `OrganizationSettings.issueNonNegotiable`, apagado por defecto: la forma clásica no
  cambia sin que alguien lo decida.
- `PromissoryNote.negotiable`, congelado al emitir. La preferencia de mañana no puede
  cambiar el texto de un documento firmado ayer, y por eso no basta con el ajuste.
- El documento imprime la cláusula cuando corresponde, y el detalle del pagaré dice cuál
  de las dos formas tiene: decide quién puede acabar cobrándolo.
- Una renovación conserva la forma del pagaré que sustituye. Un pagaré importado nace
  negociable: es lo que dice el papel que ya se firmó.

## Alternativas descartadas

- **Modelar el endoso "por si acaso".** Cadena de endosatarios, estado nuevo, quién puede
  cobrar y quién ya no: es un modelo entero. Y el día que hiciera falta de verdad,
  probablemente sería porque el negocio cambió, y entonces el modelo correcto sería otro.
- **Emitir todo "no a la orden" sin preguntar.** Cambia la naturaleza jurídica de lo que
  el usuario firma con sus deudores. Esa no es una decisión de implementación.
- **Un campo sólo en Ajustes, leído al imprimir.** El PDF se regenera a demanda: cambiar
  el ajuste habría cambiado retroactivamente el texto de documentos ya firmados, que es
  exactamente el defecto que §17.1 evitó con el folio del recibo.

## Consecuencias

Si algún día se venden o ceden pagarés, esta decisión hay que revisarla —y los emitidos
"no a la orden" no serán endosables, sólo cedibles, que es justo lo que se pidió al
marcarlos—. Queda documentado aquí para que quien lo lea entonces sepa que la ausencia
del módulo fue una decisión y no un olvido.
