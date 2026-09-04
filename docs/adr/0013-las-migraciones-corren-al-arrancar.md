# 0013. Las migraciones corren al arrancar el contenedor

Fecha: 2026-09-04 · Estado: aceptada · Reemplaza a: la nota de `docs/DEPLOY.md` §4

## Contexto

Hasta hoy las migraciones se corrían **a mano**, entrando a la terminal del contenedor
después de cada despliegue. La razón escrita era: «nunca al arrancar el contenedor: si
algún día hay dos réplicas, ambas migrarían a la vez y romperían la base».

El despliegue de hoy enseñó el coste de esa decisión. El contenedor con el código nuevo
**sólo existe después del despliegue**, así que la migración no se puede correr antes.
Entre que arranca y alguien se acuerda de entrar, la aplicación consulta columnas que
todavía no están. Y si nadie se acuerda —que es lo que pasa cuando el despliegue parece
haber ido bien—, el fallo aparece días más tarde, en la pantalla de un usuario, con la
forma de un error que parece de datos.

Ese día perdimos media hora buscando por qué producción servía código viejo. La causa era
otra, pero el orden de despliegue y migración era el segundo problema esperando turno.

## Decisión

`docker/arranque.sh` corre `prisma migrate deploy` **antes** de levantar la API y el
panel. Si falla, el arranque se detiene con código de error y los dos procesos no llegan a
existir.

El riesgo que motivaba la regla anterior ya no aplica:

- `prisma migrate deploy` toma un **bloqueo de aviso** en Postgres antes de tocar nada, así
  que dos réplicas simultáneas se ordenan solas: la segunda espera y encuentra el trabajo
  hecho.
- Las migraciones de este repositorio se escriben **repetibles** (`IF NOT EXISTS`, y
  `DO $$` para los tipos), de modo que aplicarlas dos veces no es un error. Eso permite
  además adelantarlas por fuera si algún día conviene.

Que el contenedor no arranque cuando la migración falla es la parte importante. Servir la
aplicación contra un esquema que no le corresponde da errores dispersos que parecen de
datos; no arrancar deja el motivo en una sola línea del log, y el orquestador conserva la
versión anterior mientras tanto.

`SKIP_MIGRATIONS=1` existe para depurar un arranque concreto sin tocar la base. No para
dejarlo puesto.

## Alternativas descartadas

- **Un contenedor de trabajo aparte que migre antes del despliegue.** Es la solución de
  Kubernetes y es correcta, pero aquí no hay orquestación de trabajos: Dokploy despliega
  un servicio, no una secuencia. Habría que mantener una segunda aplicación cuyo único
  propósito es correr un comando.
- **Migrar desde el código de la aplicación al iniciar Nest.** Mezcla el ciclo de vida del
  esquema con el de la aplicación y deja la migración a merced de los tiempos de espera
  del arranque. Además, con dos procesos en el contenedor, el panel arrancaría en paralelo
  a la migración.
- **Seguir a mano, con disciplina.** Es lo que había. La disciplina falla justo el día en
  que el despliegue parece correcto.

## Consecuencias

El arranque tarda más, y por eso el margen del `HEALTHCHECK` sube de 30 a 120 segundos:
una migración sobre una tabla grande puede durar más que el arranque entero, y darla por
muerta la reiniciaría en mitad del trabajo.

Una migración destructiva mal escrita ahora se aplica sola. La red que queda es la
revisión de código: el archivo `.sql` se lee antes de fusionar, como cualquier otro
cambio, y este repositorio no genera migraciones automáticas sin mirarlas.
