# Despliegue en Dokploy (VPS de Hostinger)

Dos aplicaciones y una base de datos. Nada más.

| Componente | Qué es | Dominio |
|---|---|---|
| `api` | NestJS, `apps/api/Dockerfile` | `api.tudominio.com` |
| `web` | Next.js, `apps/web/Dockerfile` | `tudominio.com` |
| `postgres` | Servicio de Dokploy | interno |

El correo sale por Resend, que es externo y no consume nada del VPS.

## Memoria

Con 4 GB alcanza. Cifras **medidas** sobre la compilación de producción, no estimadas:

| Proceso | En reposo | Trabajando | Pico medido |
|---|---|---|---|
| Dokploy + Traefik + Docker | 500–800 MB | — | — |
| Postgres | ~150 MB | 200–400 MB | — |
| API (`--max-old-space-size=320`) | ~180 MB | ~270 MB | **~355 MB** |
| Web (`--max-old-space-size=256`) | ~210 MB | ~230 MB | — |
| **Total** | | | **~1.5–2 GB** |

**De dónde sale el pico de la API.** De los zips: el paquete legal (§24.5) puede llevar
escaneos de hasta 20 MB cada uno, y la descarga masiva junta hasta cien PDFs. Los dos se
escriben en la respuesta **a medida que se comprimen** y sólo se arman **dos a la vez**;
con esas dos medidas, ocho descargas simultáneas de un expediente de 15 MB dejan el
proceso en 355 MB. Sin ellas, la misma prueba lo llevaba a 500 MB.

El `--max-old-space-size` limita el montón de JavaScript, **no** los búferes de los
archivos, que viven fuera: por eso la RSS lo supera sin que el proceso muera.

**Si el VPS tiene 2 GB**, baja `MAX_CONCURRENT` en
`documents/infrastructure/archiver.archive-builder.ts` a 1 y acota el tamaño de los
escaneos en el perfil `legal-exhibit` (§8.3), que hoy admite 20 MB por archivo.

**El pico no está en la ejecución sino en la compilación.** Un `next build` puede pedir 1–2 GB, y si Dokploy construye en el mismo VPS mientras Postgres trabaja, el kernel puede matar el proceso. Dos formas de evitarlo, elige una:

- **Swap de 2 GB** en el VPS. Es lo más simple y basta:
  ```bash
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ```
- **Construir fuera** (tu máquina o CI) y que Dokploy sólo baje la imagen de un registro.

## 1. Servicios

**Postgres.** Créalo desde Dokploy. Anota usuario, contraseña y nombre de base; la URL interna que te da es la que va en `DATABASE_URL`.

**Almacenamiento de archivos.** No hace falta ningún servicio: la API guarda las firmas y los anexos en un volumen. En la aplicación de la API, **añade un volumen montado en `/data/storage`**. Es lo único que hay que hacer, y es lo que impide que un despliegue borre las firmas.

Si algún día hace falta más de una instancia de la API, o quieres delegar las copias de seguridad, se cambia `STORAGE_DRIVER=s3` y se rellenan las variables del bucket. El código no cambia.

## 2. Aplicaciones

Para cada una: origen Git apuntando a este repositorio, tipo de build **Dockerfile**, y la ruta correspondiente (`apps/api/Dockerfile` o `apps/web/Dockerfile`). El contexto de build es la raíz del repositorio, no la carpeta de la app: las dos necesitan los paquetes compartidos.

Puertos: `3001` para la API, `3000` para la web. Dokploy pone Traefik delante y resuelve el certificado.

## 3. Variables de entorno

**API**

```
NODE_ENV=production
TZ=America/Mexico_City
API_PORT=3001
WEB_URL=https://tudominio.com
CORS_ORIGINS=https://tudominio.com

DATABASE_URL=postgresql://usuario:clave@postgres:5432/pagares?schema=public&connection_limit=10

# Los archivos van a un volumen montado en /data/storage
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=/data/storage
STORAGE_SIGNED_URL_TTL_SECONDS=900
# Los enlaces de archivo son absolutos: URL pública de la API
API_PUBLIC_URL=https://api.tudominio.com

MAIL_DRIVER=resend
MAIL_FROM="Pagarés <no-reply@tudominio.com>"
RESEND_API_KEY=...
# Secreto del webhook de entregas. Sin él, /webhooks/resend responde 503 y el
# estado de los correos se queda en "enviado" para siempre (§16).
RESEND_WEBHOOK_SECRET=whsec_...

JWT_ACCESS_SECRET=<32+ caracteres aleatorios>
JWT_REFRESH_SECRET=<32+ caracteres aleatorios, distinto del anterior>
TEMP_PASSWORD_TTL_HOURS=72
# Accesos por IP cada 15 minutos (§25.7). En producción se deja en 10.
RATE_LIMIT_AUTH_PER_15M=10
# Ráfaga por minuto. Se cuenta **por usuario** en las rutas autenticadas y por IP
# en las anónimas: los deudores entran desde el móvil y las operadoras comparten
# IP entre miles de abonados (CGNAT).
RATE_LIMIT_BURST_PER_MIN=120
# De esta cifra sale también el goteo sostenido: ocho minutos de ráfaga en una
# ventana de quince, o sea 960 por IP con el valor de arriba. Ése se cuenta por
# dirección y no por usuario, y es la defensa contra quien fabrica
# identificadores para estrenar cubo. Sube la ráfaga si varios administradores
# comparten una misma salida a internet.
# **Obligatorio en el VPS**: hay un proxy delante (Dokploy). Sin esto, `request.ip`
# es la del proxy para todo el mundo: el límite de tasa se convierte en uno solo
# para toda la instalación y la bitácora anota la IP equivocada en cada acción
# sensible (§9.3).
TRUST_PROXY_HOPS=1

# Push a iOS (§24.3). Vacío = canal apagado: el sistema funciona sólo con correo.
# La clave .p8 va en una sola línea, con \n en los saltos.
APNS_KEY_P8=
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_BUNDLE_ID=
APNS_ENVIRONMENT=production
```

Genera cada secreto con `openssl rand -base64 48`. **No reutilices los del `.env` local.**

### Webhook de entregas

En el panel de Resend, apunta el webhook a `https://tudominio.com/api/v1/webhooks/resend` con
los eventos `email.sent`, `email.delivered`, `email.bounced` y `email.complained`, y copia el
secreto que da Resend a `RESEND_WEBHOOK_SECRET`. El endpoint verifica la firma del cuerpo: sin
el secreto no acepta nada, y cualquiera que conociera la URL podría marcar como entregado un
correo que nunca salió.

**Web**

```
NODE_ENV=production
TZ=America/Mexico_City
API_URL=http://api:3001
```

La web habla con la API por la red interna de Docker, no por internet: no hace falta que salga y vuelva.

## 4. Migraciones

**Se aplican solas al arrancar el contenedor** (ADR 0013). No hay que entrar a la terminal
después de cada despliegue: `docker/arranque.sh` corre `prisma migrate deploy` antes de
levantar la API y el panel.

Si una migración falla, **el contenedor no arranca**. Es deliberado: servir la aplicación
contra un esquema que no le corresponde produce errores que parecen de datos y no lo son.
El orquestador deja corriendo la versión anterior, y el motivo está en los logs del
contenedor.

Antes se hacían a mano, por miedo a que dos réplicas migraran a la vez. Ese miedo ya no
aplica: `prisma migrate deploy` toma un bloqueo de aviso en Postgres, así que la segunda
réplica espera y encuentra el trabajo hecho. Y las migraciones de este repositorio se
escriben repetibles, para poder aplicarlas antes por fuera si hiciera falta.

Para saltárselas en un arranque concreto —depurar sin tocar la base—, `SKIP_MIGRATIONS=1`
en las variables de entorno. No es para dejarlo puesto.

Para aplicarlas a mano de todas formas, desde la terminal del contenedor:

```
./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma
```

## 5. Primer administrador

Una sola vez, desde la terminal del contenedor de la API:

```
node tools/create-admin.js --email tu@correo.com --name "Tu Nombre"
```

Imprime la contraseña una vez y falla si ya existe un administrador, para que no quede como puerta trasera. Cámbiala al entrar.

## 6. Comprobación

```
curl https://api.tudominio.com/api/v1/health   # {"status":"ok"}
```

Después: entra al dashboard, crea un usuario de prueba y confirma que llega el correo de bienvenida. Si no llega, revisa la pestaña de avisos pendientes: los fallos de envío quedan registrados con su motivo.

## Actualizaciones

`git push` a la rama configurada. Dokploy reconstruye y sustituye el contenedor. Si activaste swap, el build no compite con Postgres por memoria.
