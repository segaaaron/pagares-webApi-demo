# 0011. La prescripción avisa mejor, pero sigue sin cambiar el estado

Fecha: 2026-09-04 · Estado: aceptada

## Contexto

`prescribesOn` se calculaba al emitir, prorrogar, renovar e importar, y después no lo
tocaba nadie. La bandeja de trabajo avisaba a 180 días. Fuera de eso, el dato no hacía
nada, y tenía dos huecos que costaban dinero:

1. **Demandar no lo interrumpía.** Un pagaré con expediente judicial abierto seguía
   apareciendo en «por prescribir» un año después de la demanda, mandando al
   administrador a apagar un fuego que ya estaba apagado y escondiendo entre el ruido los
   que sí corrían peligro.
2. **Al cruzar el día cero, el pagaré desaparecía de la vista.** El aviso vivía en una
   ventana de 180 días que se cerraba justo cuando la situación se volvía definitiva.

El equipo de la aplicación propuso además un estado `PRESCRIBED` derivado.

## Decisión

Se corrigen los dos huecos y **no** se añade el estado.

- Un expediente judicial abierto (`LegalCase` sin `closedOn`) saca al pagaré de la cola
  «por prescribir»: demandar interrumpe el plazo.
- Cola nueva «fuera de plazo» para los que ya lo cruzaron sin demanda, con los días
  transcurridos. Siguen siendo cobrables —prescrito no es incobrable, y mucha gente
  paga—; lo que cambia es que ya no son exigibles en juicio, y eso cambia cómo se
  gestionan.
- El estado del pagaré **no** se toca.

§25.13 del plan lo dice con estas palabras: «el sistema **no** cambia el estado por
prescripción, porque hay actos que la interrumpen y esa valoración es jurídica, no
automática». Y es cierto en la práctica: interrumpen la demanda, el reconocimiento de
deuda del propio deudor, un abono parcial, una gestión de cobro documentada. El sistema
conoce una de esas cuatro. Marcar un pagaré como prescrito sabiendo una cuarta parte de
lo que hace falta es afirmar algo que no se puede sostener frente a un abogado.

Hay además una consecuencia práctica: el estado se **deriva** en cada lectura desde el
saldo, el atraso, la firma y las banderas de anulación y castigo. `PRESCRIBED` tendría
que entrar en esa derivación, y entonces aparecería también en el rol CLIENT. El deudor
vería en su teléfono el día exacto a partir del cual le conviene dejar de contestar.

## Alternativas descartadas

- **`PRESCRIBED` en la derivación, oculto para el rol CLIENT.** Bifurcar la derivación
  por rol convierte el estado en dos verdades distintas del mismo pagaré. La primera vez
  que alguien olvide la bifurcación, se filtra.
- **`PRESCRIBED` como transición manual.** El estado no se guarda, se deriva: el primer
  recálculo lo pisaría.

## Consecuencias

`prescribesOn` sigue siendo informativo, que es lo que el plan quiere. Si algún día se
decide lo contrario hará falta modelar los actos interruptivos —reconocimiento de deuda,
abono parcial, gestión documentada— antes que el estado; sin ellos, la fecha calculada no
es la fecha real de prescripción, y un pagaré marcado como prescrito por error es una
deuda cobrable que nadie vuelve a mirar.
