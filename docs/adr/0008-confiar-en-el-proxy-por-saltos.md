# 0008. Confiar en el proxy contando saltos, no con un booleano

Fecha: 2026-09-03 · Estado: aceptada

## Contexto

La API corre detrás del proxy de Dokploy, y Express no confiaba en él. Consecuencias, las
dos silenciosas: `request.ip` era la del proxy **para todos los usuarios**, así que el
límite de tasa de §25.7 dejaba de ser por IP y pasaba a ser uno solo para toda la
instalación —el primero que hiciera diez accesos fallidos dejaba fuera al resto—, y la
bitácora de acciones sensibles (§9.3) anotaba siempre la misma dirección, que es como no
anotar ninguna.

## Decisión

`TRUST_PROXY_HOPS` dice cuántos proxies hay delante. `0` por omisión (acceso directo);
`1` en el VPS. Express confía en exactamente ese número de saltos de `X-Forwarded-For`.

## Alternativas descartadas

- **`app.set('trust proxy', true)`**: confía en la cadena entera, y entonces el cliente
  puede inventarse su origen añadiendo cabeceras. El límite de tasa y la bitácora se
  volverían decorativos.
- **Confiar siempre en un salto**: en desarrollo no hay proxy, y cualquiera en la red
  local podría falsear su IP contra la máquina de quien programa.

## Consecuencias

El límite vuelve a ser por usuario y la bitácora guarda la IP real. Exige acordarse de
poner `TRUST_PROXY_HOPS=1` al desplegar: está documentado en `docs/DEPLOY.md` como
obligatorio, junto al motivo.

## Ampliación: la ráfaga se cuenta por usuario

Contar por IP tampoco basta con el cliente real de este sistema. Los deudores entran desde
el móvil y las operadoras meten a miles de abonados detrás de una misma dirección (CGNAT);
varios administradores en una oficina comparten otra. Con la ráfaga por IP, cien usuarios
tras la misma dirección se agotan entre ellos 120 peticiones por minuto y la aplicación
empieza a devolver 429 a gente que no ha hecho nada raro.

`UserAwareThrottlerGuard` cuenta la ventana corta **por usuario** cuando la petición viene
autenticada, y deja la ventana larga por IP. El identificador se lee del token sin
verificar la firma —aquí sólo elige un cubo, y verificarlo obligaría a hacer criptografía
antes del límite de tasa, que es lo que el límite existe para evitar—; la autenticación de
verdad ocurre un paso después. Quien fabrique identificadores para estrenar cubo se topa
igualmente con el límite sostenido de su IP.

Medido con la ráfaga en 30/min: el usuario A agota su cubo (30 y luego 429) y el usuario B,
desde la misma IP, sigue respondiendo 200. Sin este cambio, B habría heredado el 429 de A.
