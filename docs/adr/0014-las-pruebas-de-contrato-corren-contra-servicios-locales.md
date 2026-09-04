# 0014. Las pruebas de contrato corren contra servicios locales, no contra Testcontainers

Fecha: 2026-09-04 · Estado: aceptada

## Contexto

§25.9 pedía Testcontainers para el nivel «de contrato»: cada implementación de un puerto
pasa la misma batería, con el servicio real levantado por la propia prueba.

Testcontainers exige un demonio de contenedores en la máquina que ejecuta las pruebas. El
entorno de desarrollo de este proyecto no lo tiene, y el resto del proyecto ya decidió no
depender de contenedores para trabajar: los servicios locales son Homebrew (README §2.2) y
el almacenamiento por omisión es un volumen del propio servidor (ADR 0009). Meter un
demonio de contenedores sólo para las pruebas añadía una tercera forma de levantar lo
mismo.

## Decisión

La batería de contrato corre contra los servicios que ya se levantan a mano:

- **Postgres** de Homebrew para lo que toca base de datos, igual que las pruebas de
  extremo a extremo, que ya funcionaban así.
- **MinIO** local (`pnpm services:minio`) para la mitad de S3 del puerto `ObjectStorage`.
  Si no responde, ese bloque **se salta con aviso por consola**, y la mitad del volumen
  local sigue corriendo.

Las pruebas viven en `apps/api/test/*.contract.e2e.ts` y entran en `pnpm test:e2e`, no en
`pnpm verify`: `verify` tiene que correr sin nada levantado.

## Alternativas descartadas

- **Testcontainers igualmente**: obliga a instalar y arrancar un demonio de contenedores
  para tocar el dominio, y la prueba tarda decenas de segundos en levantar la imagen.
- **Probar sólo el adaptador local**: es justo lo que la regla L de §7 existe para impedir.
  La diferencia entre adaptadores aparece en producción, con una firma dentro.
- **Falsificar S3 con un doble en memoria**: un doble pasa la batería por construcción; no
  dice nada de MinIO.

## Consecuencias

Levantar los servicios es responsabilidad de quien corre las pruebas, y el salto de la
mitad de S3 es silencioso salvo por el aviso: hay que leerlo. A cambio, la batería corre en
menos de un segundo y no añade dependencias al entorno de desarrollo.

Cuando exista CI (§20.3), esta decisión se revisa: allí los servicios los levanta el
runner, y Testcontainers vuelve a estar sobre la mesa sin coste para nadie.
