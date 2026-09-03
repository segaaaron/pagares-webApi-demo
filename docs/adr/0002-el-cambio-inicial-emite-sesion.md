# 0002. El cambio inicial de contraseña emite sesión

Fecha: 2026-09-03 · Estado: aceptada

## Contexto

§10.3, flujo 2, dice que `password/change-initial` «deja la cuenta `ACTIVE` y emite el par
de tokens». La implementación devolvía `{ ok: true }`, y el panel web no tenía pantalla
para ese reto: quien entraba con una contraseña temporal leía «cámbiala desde la
aplicación», que para un administrador —que no tiene app— era un callejón sin salida.

## Decisión

`password/change-initial` devuelve la misma respuesta de sesión que el login, con su
cookie de refresh, y la web completa el reto en `/login/cambiar`.

## Alternativas descartadas

- **Devolver `ok: true` y pedir un segundo login**: hace teclear la contraseña recién
  elegida dos veces y consume el límite de accesos de §25.7 por partida doble.
- **Emitir la sesión en el propio login**: entregaría tokens a quien todavía tiene una
  contraseña temporal, que es lo que el reto existe para evitar.

## Consecuencias

Hay un solo camino de entrada para el primer acceso y la contraseña se escribe una vez.
La emisión de la sesión queda en `SessionIssuer`, compartido con el login, de modo que
ninguno de los dos puede olvidarse del registro del dispositivo ni de la caducidad del
refresh.
