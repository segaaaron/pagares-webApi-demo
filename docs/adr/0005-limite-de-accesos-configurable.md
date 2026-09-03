# 0005. El límite de accesos se configura por entorno

Fecha: 2026-09-03 · Estado: aceptada

## Contexto

§25.7 fija diez accesos por IP cada quince minutos. La suite de extremo a extremo abre
varias sesiones seguidas —da de alta clientes, estrena sus contraseñas y comprueba BOLA—
y agotaba el cupo, con lo que fallaba por el límite de tasa y no por lo que estaba
probando: un rojo que no dice nada es peor que no tener la prueba.

## Decisión

El cupo de las rutas de credenciales se lee de `RATE_LIMIT_AUTH_PER_15M`, con **10** por
omisión. Los throttlers pasan a declararse con nombre (`auth`, `otp`, `public`) y el
módulo se configura de forma asíncrona con el entorno ya validado.

## Alternativas descartadas

- **Bajar el número de accesos de las pruebas**: aplaza el problema; cualquier prueba nueva
  vuelve a chocar con el techo.
- **Desactivar el límite en pruebas con una bandera booleana**: una bandera que apaga un
  control de seguridad es la que alguien acaba dejando encendida en producción. Un número
  configurable no se puede «olvidar en on».

## Consecuencias

Producción mantiene el límite del plan sin tocar nada, y el valor efectivo queda visible en
el entorno. Subirlo es una decisión explícita que se lee en `.env`, no un cambio de código.

## Corrección (mismo día)

La primera implementación declaró throttlers **con nombre** (`auth`, `otp`, `public`) y los
decoradores se limitaban a nombrarlos. Estaba mal: `@nestjs/throttler` aplica todos los
throttlers declarados a **todas** las rutas, así que el de OTP —veinte por hora— quedó
impuesto sobre la API entera, ruta por ruta. El síntoma engañaba: las pruebas pasaban
sueltas y fallaban al repetirlas.

Ahora sólo existen los dos throttlers globales del plan (`short`, `long`) y las rutas
sensibles **estrechan** el global con `@Throttle`. Lo fija
`shared/http/throttler.config.test.ts`, que falla si alguien vuelve a añadir un throttler
con nombre.
