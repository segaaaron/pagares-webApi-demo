# 0007. El descuadre de saldo se resuelve desde el panel

Fecha: 2026-09-03 · Estado: aceptada

## Contexto

§22.5 pide comprobar que `paidCents` cuadra con el libro de abonos. Se añadió la
comprobación (§0005 del cuadre en Ajustes) y apareció el problema real: el sistema sabía
**detectar** el descuadre y no tenía ninguna forma de **resolverlo**. La pantalla se ponía
en rojo y la única salida era abrir `psql` contra producción, que es exactamente lo que
genera el siguiente descuadre.

## Decisión

`POST /admin/notes/:id/recalculate-balance`, en el módulo `payments` —que es quien
recalcula saldo según §3.1— recalcula `paidCents` como la suma del libro y vuelve a
derivar estado, clasificación y tramo. Queda en la bitácora con actor e importes antes y
después. En Ajustes, cada fila descuadrada lleva su botón.

## Alternativas descartadas

- **Corregir en silencio al detectar**: taparía el problema que la comprobación existe
  para enseñar. Un descuadre puede venir de un abono que falta, y ajustarlo sin más lo
  daría por bueno.
- **Asentar un abono de ajuste por la diferencia**: falsearía el libro, que es la verdad
  (§12.2). El libro no se toca: se corrige la copia.
- **Dejarlo en `reports`**: ese módulo es de sólo lectura y no escribe nada (§3.1).

## Consecuencias

Un descuadre tiene salida dentro del producto y con rastro. Si el saldo **sube** al
recalcular, es que falta asentar un abono: la pantalla lo dice, y eso se arregla
registrándolo, no aquí. La operación es idempotente: repetirla sobre un pagaré sano
responde `changed: false`.
