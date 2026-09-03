#!/bin/sh
# Arranca la API y el panel en el mismo contenedor.
#
# Sin supervisor: `wait -n` devuelve en cuanto uno de los dos termina, y
# entonces se tumba el otro y se sale con error. Así el contenedor muere entero
# y el orquestador lo levanta limpio, en vez de quedarse a medias —con el panel
# vivo y la API caída, que es la peor de las situaciones: todo responde, todo
# falla.
set -e

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
