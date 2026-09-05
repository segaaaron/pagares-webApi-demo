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
- **Identificar al deudor también por teléfono**, no sólo por correo. El correo es
  opcional, así que volver a teclear al mismo deudor creaba otra ficha y la regla se
  saltaba sola sin mala intención. La importación ya identificaba por teléfono; ahora la
  emisión usa la misma identidad.

## Consecuencias

Emitir es ahora una operación que puede fallar por el estado de **otro** documento. El
panel lo dice antes de que ocurra donde puede: el botón «Duplicar» de un pagaré sin firma
se queda a la vista, apagado y con el motivo, en vez de llevar a un formulario que va a
rebotar.

Dos deudores que compartan teléfono se tratan como uno. Es el mismo criterio que ya usaba
la importación, y el caso contrario —un deudor con dos fichas— hacía más daño: partía su
historial y burlaba esta regla.

Y refuerza lo que ya estaba propuesto: **firmar la serie de una vez**. Con doce cuotas que
se firman una a una, el deudor no puede recibir nada nuevo hasta terminar las doce, que es
justo lo que se quiere; pero también hace más molesto el camino de las doce firmas.
