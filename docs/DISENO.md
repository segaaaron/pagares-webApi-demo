# Lo que hay que saber antes de tocar el código

Reglas que el proyecto da por sentadas en todas partes. No se deducen leyendo un archivo
suelto, y romperlas no suele dar error de compilación: da cifras equivocadas.

El desarrollo completo está en [`PLAN.md`](PLAN.md); las decisiones posteriores, en
[`adr/`](adr/).

## Cómo está organizado

Cada módulo de la API tiene tres capas y la dependencia siempre apunta hacia adentro:

```
infrastructure  →  application  →  domain
(Nest, Prisma,     (casos de uso)   (entidades, reglas,
 sharp, S3)                          puertos)
```

`domain/` no importa NestJS, Prisma ni sharp, y ningún módulo importa la infraestructura de
otro. **No es una convención de buena voluntad**: `pnpm arch` falla el build si se rompe.

Los módulos se hablan por puertos inyectados o por eventos. Importar el repositorio de otro
módulo, leer su tabla o llamar a su caso de uso desde un controlador ajeno está prohibido.

## El dinero

**Enteros de centavos** (`BigInt`), nunca coma flotante. Un pagaré de $25,000.00 no puede
persistirse como 24,999.999999.

**El libro de abonos es sólo de anexar.** Anular un abono asienta una reversa con importe
negativo; la fila original nunca se modifica. El saldo que guarda el pagaré es una copia de
la suma del libro: Ajustes enseña si alguna se ha desviado y permite recalcularla, con
rastro en la bitácora.

## El estado del pagaré

**Se deriva, no se teclea.** Lo calculan el saldo y el reloj. Sólo anular, castigar,
convenir y renovar son manuales, y las cuatro piden motivo de catálogo.

**Vencido no es cartera vencida.** Vencido es un día de atraso; cartera vencida son 90 días
naturales. Son dos campos distintos y confundirlos deforma los indicadores.

**Castigar no es perdonar.** El pagaré sale de la cartera activa, pero la deuda sigue
siendo exigible y admite abonos como recuperación.

**Castigar y perdonar se confirman escribiendo el folio.** Lo comprueba el servidor, no la
pantalla: son las dos acciones con impacto económico irreversible.

## El tiempo

**Las fechas civiles no tienen zona.** Se comparan contra hoy en `America/Mexico_City` y el
reloj se inyecta. Usar UTC hace que un vencimiento se marque un día antes; usar
`new Date()` en el dominio hace que las pruebas no puedan fijar los bordes.

## Las firmas

**Firmado no siempre es firmado en pantalla.** La cartera importada entra con
`signatureMode = PAPER`: cuenta como firmada y no genera certificado de evidencia. Fingir
una firma electrónica que nunca existió le quitaría valor a las que sí la tienen.

## Los avisos

**Nada se dispara solo.** No hay cron ni cola: los recordatorios se mandan cuando el
administrador lo decide. Lo que sí vive en tabla es **qué** se dice: la regla del tramo
elige la plantilla, y pulsar dos veces el mismo día no manda dos correos.

## La seguridad

**Denegar por defecto.** Sin guard explícito, la ruta no responde. `@Public()` es la
excepción y se justifica.

**El servidor es la autoridad.** Folio, importe en letra, estado, saldo, interés y
clasificación se calculan en el servidor. El cliente nunca los envía.

**La bitácora es una cadena.** Cada registro lleva el hash del anterior: alterar una fila
directamente en la base rompe la cadena, y el panel lo enseña.
