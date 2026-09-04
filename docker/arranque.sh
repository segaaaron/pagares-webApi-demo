#!/bin/sh
# Arranca la API y el panel en el mismo contenedor.
#
# Sin supervisor: `wait -n` devuelve en cuanto uno de los dos termina, y
# entonces se tumba el otro y se sale con error. Así el contenedor muere entero
# y el orquestador lo levanta limpio, en vez de quedarse a medias —con el panel
# vivo y la API caída, que es la peor de las situaciones: todo responde, todo
# falla.
set -e

# ─────────────────────────────────────────────────────────── migraciones
#
# Antes esto se corría a mano desde la terminal del contenedor, y la razón era
# buena: dos réplicas migrando a la vez romperían la base. Pero el contenedor
# con el código nuevo sólo existe DESPUÉS del despliegue, así que entre que
# arranca y alguien se acuerda de entrar a migrar, el código nuevo consulta
# columnas que todavía no están. Y si nadie se acuerda, el fallo aparece días
# después, en la pantalla de un usuario.
#
# Se corren aquí porque el riesgo que se evitaba ya no existe: `prisma migrate
# deploy` toma un bloqueo de aviso en Postgres antes de empezar, así que dos
# réplicas simultáneas se ordenan solas —la segunda espera y encuentra el
# trabajo hecho—. Y las migraciones de este repositorio se escriben repetibles.
#
# Si falla, NO se arranca. Servir la aplicación contra un esquema que no le
# corresponde da errores que parecen de datos y no lo son.
if [ "${SKIP_MIGRATIONS:-}" = "1" ]; then
  echo "[arranque] migraciones saltadas por SKIP_MIGRATIONS=1"
else
  echo "[arranque] aplicando migraciones…"
  if ! ./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma; then
    echo "[arranque] ERROR: las migraciones fallaron; no se arranca la aplicación" >&2
    exit 1
  fi
  echo "[arranque] migraciones al día"
fi

terminar() {
  kill "$PID_API" "$PID_WEB" 2>/dev/null || true
  wait "$PID_API" "$PID_WEB" 2>/dev/null || true
}
trap terminar TERM INT

node dist/main.js &
PID_API=$!

node web/apps/web/server.js &
PID_WEB=$!

wait -n "$PID_API" "$PID_WEB"
CODIGO=$?

terminar
exit "$CODIGO"
