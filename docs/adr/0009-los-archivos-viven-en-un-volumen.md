# 0009. Los archivos viven en un volumen, no en un MinIO

Fecha: 2026-09-03 · Estado: aceptada

## Contexto

§8 guarda firmas y anexos en un almacenamiento compatible con S3, y el despliegue montaba
un MinIO al lado de la API. Para una instalación de un solo servidor eso son: un contenedor
más, ~100 MB de memoria, una consola aparte, un bucket que crear y un par de llaves que
gestionar y rotar. Todo para que un proceso escriba archivos en un disco que ya tiene
debajo.

El coste real no era la memoria: era la configuración. Cuatro variables más, un servicio
que hay que levantar antes que la API, y un fallo silencioso —`InvalidAccessKeyId`— cuando
las llaves no coinciden.

## Decisión

`STORAGE_DRIVER` elige el adaptador del puerto `ObjectStorage`. Por omisión, `local`:
los archivos van a `STORAGE_LOCAL_DIR`, un volumen montado en el contenedor. `s3` sigue
disponible sin tocar código.

Los enlaces temporales, que en S3 firma el propio bucket, los firma la API: un HMAC sobre
la clave y la caducidad, con el secreto de los tokens. Se sirven por `GET /files/*` con
`@Public()`, porque la autorización **es la firma**, igual que en una URL prefirmada.

## Alternativas descartadas

- **Servir los archivos con el token de sesión**: acabaría en la URL de cada `<img>`, y de
  ahí a los logs del proxy y al historial del navegador.
- **Guardar en la base de datos**: infla las copias, el `pg_dump` deja de ser manejable y
  cada lectura pasa por el pool de conexiones.
- **Disco del contenedor sin volumen**: un despliegue borraría las firmas, que son prueba
  legal.

## Consecuencias

Una instalación necesita dos aplicaciones y una base, sin servicios de almacenamiento y sin
llaves. A cambio: **las copias del volumen son responsabilidad de quien opera el servidor**,
y no se puede escalar a varias instancias de la API sin cambiar a `s3` —cada una vería sólo
sus archivos.

Las subidas directas pasan a atravesar la API en lugar de ir al bucket. Se leen del flujo
con un tope de 21 MB, y las descargas salen por streaming: la memoria del proceso no crece
con el tamaño del archivo.
