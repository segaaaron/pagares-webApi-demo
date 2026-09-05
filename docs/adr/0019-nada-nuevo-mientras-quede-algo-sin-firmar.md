# 0019. No se le emite otro pagaré a quien no firmó el anterior

Fecha: 2026-09-04 · Estado: aceptada

## Contexto

Regla dictada por el dueño del producto: **mientras el deudor no firme el pagaré, no se le
puede generar otro**.

Tiene fondo. Un título sin firma no obliga a nadie: es una petición, no una deuda. Apilarle
un segundo encima produce papeles que no valen, un deudor que no sabe cuántos tiene delante
y un administrador que no puede decir qué aceptó realmente. Y si un día hay que cobrar, lo
que se lleva al juzgado es la firma, no la emisión.

## Decisión

`IssueNoteUseCase` rechaza la emisión con **409 `debtor_has_unsigned_note`** cuando el
deudor tiene algún pagaré en `PENDING_SIGNATURE` o `PROCESSING_SIGNATURE`. El folio
pendiente va en el mensaje: quien emite necesita saber a por qué firma ir, no un «no se
pudo».

Tres precisiones que la regla necesita para no significar otra cosa:

1. **Una serie completa sí se emite.** Sus cuotas nacen en el mismo acto y se firman en el
   mismo acto; la comprobación corre antes de crearlas, así que no cuentan contra sí
   mismas. Si contaran, no habría planes de pago (ADR 0015).
2. **Lo anulado y lo renovado no bloquean.** Uno no se debe y el otro se debe en el
   documento nuevo (§13.7).
3. **La importación no queda sujeta a la regla.** Entra cartera vieja ya firmada en papel
   (§24.5): no hay firma que esperar.

Dos cosas que la hacen real y no un adorno:

- **Un cerrojo por deudor** (`pg_advisory_xact_lock`) tomado **por teléfono** y antes de
  resolver la ficha. Sin él, dos altas simultáneas leen las dos que no hay nada pendiente y
  emiten las dos. Y sobre la ficha no serviría: si el deudor todavía no existe, cada
  transacción crearía la suya y las llaves no coincidirían.
- **La comprobación busca por teléfono, no por ficha.** El correo es opcional, así que
  volver a teclear al mismo deudor creaba una ficha nueva sin nada pendiente y la regla se
  saltaba sola sin mala intención.

  Se probó antes a **unir las fichas** por teléfono, y se descartó: dos personas que
  comparten línea —una familia, un negocio— acabarían con el pagaré de una emitido a
  nombre de la otra. Un título a nombre equivocado es un defecto peor que un historial
  partido, y además silencioso. Así la regla no se puede burlar y cada ficha sigue siendo
  de quien es.

## Consecuencias

Emitir es ahora una operación que puede fallar por el estado de **otro** documento. El
panel lo dice antes de que ocurra donde puede: el botón «Duplicar» de un pagaré sin firma
se queda a la vista, apagado y con el motivo, en vez de llevar a un formulario que va a
rebotar.

Dos deudores que compartan teléfono se bloquean entre sí: si uno tiene un pagaré sin
firmar, al otro no se le emite. Es el precio de que la regla no se pueda burlar, y se
prefiere a la alternativa —unir sus fichas— que emitiría títulos a nombre equivocado. El
mensaje del 409 trae el folio, así que se ve enseguida que es de otra persona.

Un mismo deudor tecleado dos veces sigue produciendo dos fichas y su historial partido. Es
un defecto anterior a esta regla y no lo tapa: se decide aparte.

Con la firma por pagaré (ADR 0021), el deudor no puede recibir nada nuevo hasta terminar
las doce firmas. Es el efecto buscado —no se le apila deuda que no ha aceptado— y también
el incentivo para que termine; pero obliga a que la aplicación le diga cuántas le faltan y
qué desbloquean, en el momento en que pide algo y no puede.
