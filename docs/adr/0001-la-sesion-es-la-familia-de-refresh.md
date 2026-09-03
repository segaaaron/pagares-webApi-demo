# 0001. La sesión es la familia de refresh

Fecha: 2026-09-03 · Estado: aceptada

## Contexto

§10.4 dice que el cambio de contraseña autenticado «conserva sólo la sesión desde la que
se hizo». El `sessionId` del access token era un uuid nuevo en cada emisión —y el refresco
generaba otro—, así que no existía ningún identificador estable con el que decir «ésta».
El caso de uso aceptaba `keepCurrentSession` con el **id de la fila** de refresh, dato que
el controlador no tenía sin volver a leer la cookie y rehashear el token.

## Decisión

El `sessionId` del access token **es** el `familyId` de la familia de refresh, y la
revocación en cascada perdona por familia.

## Alternativas descartadas

- **Guardar `sessionId` en `RefreshToken`**: una columna más que hay que propagar en cada
  rotación, y dos identificadores para la misma cosa.
- **Reconocer la cookie en el controlador**: obliga a hashear el refresh en la capa HTTP y
  no sirve para iOS, que no usa cookies.

## Consecuencias

«Sesión» pasa a significar «este dispositivo desde que entró», que es lo que entiende
quien lee la pantalla de seguridad. La rotación del refresh ya no cambia de sesión, así
que un cambio de contraseña no expulsa al que lo hizo. Revertirlo exige volver a un
identificador por token y decidir de nuevo qué se perdona.
