# Pagaré Digital

Monorepo con la API y el panel web para emitir pagarés, recogerlos firmados y llevar el
control del cobro.

- **`apps/api`** — API REST en NestJS 11 sobre PostgreSQL. Única puerta a la base de datos,
  al almacenamiento de objetos y al correo.
- **`apps/web`** — Panel del administrador y vista pública en Next.js 15 (App Router).
- **`packages/*`** — Contratos, reglas puras, clases base y plantillas de correo,
  compartidos por las dos aplicaciones.

| | |
|---|---|
| **Runtime** | Node 22 · TypeScript strict |
| **Datos** | PostgreSQL 16 · Prisma 6 |
| **Archivos** | Volumen del servidor, o cualquier S3 compatible |
| **Correo** | Resend en producción · Mailpit en local |
| **Push** | APNs (opcional; apagado si no se configura) |
| **Gestor** | pnpm 11 + Turborepo |

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Instalación](#2-instalación)
3. [Variables de entorno](#3-variables-de-entorno)
4. [Ejecutar en desarrollo](#4-ejecutar-en-desarrollo)
5. [Scripts](#5-scripts)
6. [API](#6-api)
7. [Pruebas](#7-pruebas)
8. [Estructura](#8-estructura)
9. [Despliegue](#9-despliegue)
10. [Solución de problemas](#10-solución-de-problemas)

---

## 1. Requisitos

| Herramienta | Versión mínima |
|---|---|
| Node | 22 |
| pnpm | 11.4 |
| PostgreSQL | 16 |
| Mailpit | cualquiera |

```bash
# macOS
brew install node pnpm postgresql@16 mailpit

# Comprobación
node -v && pnpm -v && postgres -V
```

---

## 2. Instalación

### 2.1 Clonar e instalar dependencias

```bash
git clone git@github.com:segaaaron/pagares-webApi-demo.git
cd pagares-webApi-demo
pnpm install
```

### 2.2 Levantar los servicios

```bash
brew services start postgresql@16
brew services start mailpit
```

Verificar:

```bash
pg_isready                                                       # accepting connections
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8025   # 200
```

### 2.3 Crear la base de datos

```bash
psql -d postgres -c "CREATE ROLE pagares LOGIN PASSWORD 'pagares_local' CREATEDB"
psql -d postgres -c "CREATE DATABASE pagares OWNER pagares"
```

Los archivos —firmas y anexos— se guardan en `.local/storage`, que se crea solo.

### 2.4 Migrar y sembrar

```bash
pnpm db:migrate     # aplica el esquema
pnpm db:seed        # datos de demostración (idempotente)
```

---

## 3. Variables de entorno

```bash
cp .env.example .env
```

`.env.example` documenta todas las variables. En desarrollo solo hay que rellenar dos:

| Variable | Valor en local |
|---|---|
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | otro distinto del anterior |

Las de Resend y APNs pueden quedar vacías: el correo va a Mailpit y el push queda apagado.
El almacenamiento viene en `local`, que guarda en una carpeta y no pide credenciales.

**Producción** — ver [`docs/DEPLOY.md`](docs/DEPLOY.md). Tres que suelen olvidarse:

| Variable | Por qué importa |
|---|---|
| `TRUST_PROXY_HOPS=1` | Detrás de un proxy inverso, sin esto todas las peticiones parecen venir de la misma IP |
| `RESEND_WEBHOOK_SECRET` | Sin él, el webhook de entregas responde 503 y el estado de los correos nunca se actualiza |
| `RATE_LIMIT_AUTH_PER_15M` | Accesos por IP cada 15 minutos. 10 en producción |

`.env` está en `.gitignore`.

---

## 4. Ejecutar en desarrollo

```bash
pnpm dev            # arranca api y web
```

| Servicio | URL |
|---|---|
| Panel web | http://localhost:3000 |
| API | http://localhost:3001/api/v1 |
| Buzón de correo | http://localhost:8025 |

Credenciales del seed: `admin@pagares.local` / `Demo-Pagares-2026`.

Para producción, `pnpm build` y después `pnpm start` en cada aplicación.

---

## 5. Scripts

| Script | Qué hace |
|---|---|
| `pnpm dev` | api y web en modo desarrollo |
| `pnpm build` | compila ambas aplicaciones |
| `pnpm verify` | lint + typecheck + pruebas + regla de arquitectura |
| `pnpm test` | solo las pruebas unitarias |
| `pnpm test:e2e` | extremo a extremo y contrato de puertos (requiere la API levantada) |
| `pnpm test:a11y` | navegador: accesibilidad y flujos (requiere api y web levantadas) |
| `pnpm perf:k6` | prueba de carga (requiere k6) |
| `pnpm services:up` | Postgres y Mailpit por Homebrew |
| `pnpm services:minio` | MinIO local, sólo para la mitad de S3 del contrato |
| `pnpm lint` · `pnpm typecheck` | por separado |
| `pnpm arch` | verifica la regla de dependencias entre capas |
| `pnpm db:migrate` | crea y aplica una migración de desarrollo |
| `pnpm db:deploy` | aplica migraciones pendientes (producción) |
| `pnpm db:seed` | datos de demostración |
| `pnpm admin:create --email tu@correo.com` | crea el primer administrador en un entorno vacío |

`pnpm verify` es la puerta de entrada a `main`: si no pasa, el cambio no está listo.

---

## 6. API

**Base:** `http://localhost:3001/api/v1` · versionada por URL.

**Autenticación:** `Bearer` con JWT de 15 minutos. El *refresh* viaja en cookie `httpOnly`
y se rota en cada uso. Dos roles: `ADMIN` y `CLIENT`.

**Errores:** RFC 9457 (`application/problem+json`) con un código estable del catálogo.

```json
{
  "type": "https://api.pagares.mx/errors/payment_exceeds_balance",
  "title": "El abono supera el saldo",
  "status": 422,
  "code": "payment_exceeds_balance",
  "traceId": "8675a897-3b1e-40dc-af99-c0cc9dd9de0d"
}
```

**Idempotencia:** las operaciones que crean o mueven dinero aceptan la cabecera
`Idempotency-Key`. Repetir la misma clave con el mismo cuerpo devuelve el resultado
original; con un cuerpo distinto responde `422`.

**Paginación:** por cursor. `?limit=25&cursor=...`; la respuesta trae `page.nextCursor`.

### Autenticación — `/auth`

| Método | Ruta | Acceso |
|---|---|---|
| `POST` | `/auth/login` | público |
| `POST` | `/auth/refresh` | cookie de refresco |
| `POST` | `/auth/logout` | cookie de refresco |
| `POST` | `/auth/password/change-initial` | token de cambio |
| `POST` | `/auth/password/change/request` · `/confirm` | autenticado |
| `POST` | `/auth/password/forgot` · `/reset` | público |

### Cliente — `/me`

| Método | Ruta |
|---|---|
| `GET` | `/me/summary` |
| `GET` | `/me/notes` · `/me/notes/:id` |
| `GET` | `/me/notes/:id/payments` |
| `GET` | `/me/notes/:id/documents/:type` |
| `GET` | `/me/activity` |
| `POST` | `/notes/:id/signature` |

Todo filtra por el usuario del token: un cliente no puede leer ni descargar nada de otro.

### Administración — `/admin`

| Recurso | Rutas |
|---|---|
| Pagarés | `GET·POST /admin/notes` · `GET /admin/notes/:id` |
| Ciclo de vida | `POST /admin/notes/:id/{payments,void,write-off,reinstate,extensions,renew,settlements}` |
| Consulta | `GET /admin/notes/:id/simulate` |
| Documentos | `GET /admin/notes/:id/documents/{note,receipt/:paymentId,release,evidence}` · `/legal-package` |
| Descarga masiva | `GET /admin/documents/bundle?noteIds=…` |
| Correo | `POST /admin/notes/:id/send-email` · `/reminders` |
| Cobranza | `GET·POST /admin/notes/:id/activities` · `GET·PUT /admin/reminder-rules` |
| Legal | `POST·GET /admin/notes/:id/legal-case` · `POST /legal-case/actions` · `PATCH /custody` |
| Abonos | `POST /admin/payments/:id/void` · `POST /admin/notes/:id/recalculate-balance` |
| Convenios | `GET /admin/settlements` · `PATCH /admin/settlements/:id` |
| Deudores | `GET /admin/debtors` · `GET /admin/debtors/:id` |
| Usuarios | `GET·POST /admin/users` · `POST /admin/users/:id/:action` |
| Reportes | `GET /admin/reports/{work-queue,portfolio,accounting,balance-check,:report}` |
| Importación | `POST /admin/imports/{debtors,notes}` |
| Configuración | `GET·PUT /admin/settings` |
| Auditoría | `GET /admin/audit` · `/admin/audit/verify` |

### Otros

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/health` | público |
| `GET` | `/public/notes/:token` | público, solo lectura |
| `POST` | `/uploads/presign` | autenticado |
| `GET`·`PUT` | `/files/*` | enlace firmado con caducidad |
| `POST` | `/webhooks/resend` | firma HMAC del proveedor |

El contrato de cada cuerpo y cada respuesta vive en `packages/contracts`: schemas zod que
consumen tanto la API como el panel, de modo que no hay dos definiciones del mismo campo.

---

## 7. Pruebas

```bash
pnpm verify         # 402 unitarias + lint + typecheck + arquitectura
pnpm test:e2e       # 130 contra la API real: e2e, seguridad, concurrencia y contrato
pnpm test:a11y      # 23 de navegador: accesibilidad y flujos del panel
pnpm perf:k6        # carga: 100 usuarios, 30 minutos
```

| Nivel | Qué comprueba | Qué necesita |
|---|---|---|
| Unitarias | Reglas puras, contratos, plantillas y presentación del panel | Nada |
| Extremo a extremo | Ciclo de vida completo e idempotencia | API levantada y sembrada |
| Seguridad | BOLA y BFLA por endpoint, enumeración, mass assignment | API levantada |
| Concurrencia y sesión | Folio irrepetible, saldo que no se sobrepasa, refresh reutilizado, bloqueo por cuenta | API levantada |
| Contrato de puertos | Las dos implementaciones de `ObjectStorage` pasan la misma batería | API levantada; MinIO para la mitad de S3 |
| Accesibilidad | WCAG 2.1 AA en las once rutas críticas | api y web levantadas |
| Flujos de navegador | Lo que sólo se rompe en el navegador: que un botón confirme al terminar | api y web levantadas |
| Carga | Objetivos de servicio de §22.1 | k6 y los límites de tasa subidos |

```bash
pnpm dev            # en una terminal
pnpm test:e2e       # en otra
pnpm test:a11y      # y las de accesibilidad, con la web ya compilada
```

La mitad de S3 del contrato se salta con aviso si MinIO no responde; levántalo con
`pnpm services:minio` para cubrirla (ADR 0014).

La prueba de carga sale entera de una IP, así que exige subir `RATE_LIMIT_BURST_PER_MIN`
—de ella se deriva también el cupo sostenido—; con el valor de producción se mide el
límite de tasa y no la API. Para eso está `.env.load`:

```bash
dotenv -e .env -e .env.load -- pnpm --filter @pagares/api start
```

---

## 8. Estructura

```
apps/
  api/                  API NestJS
    prisma/             esquema y migraciones
    src/modules/        un módulo por responsabilidad
    test/               extremo a extremo, contrato de puertos y carga
  web/                  Panel Next.js
    src/app/            rutas (App Router)
    src/features/       vistas y acciones de servidor
    test/a11y/          auditorías de accesibilidad (Playwright + axe)
    test/flujos/        flujos de navegador (Playwright)
packages/
  contracts/            schemas zod, tipos y códigos de error
  domain-rules/         reglas puras: dinero, calendario, interés, cartera
  api-core/             clases base de casos de uso y persistencia
  emails/               plantillas de correo
docs/                   plan de arquitectura, despliegue y decisiones
```

Cada módulo de la API se divide en `domain/`, `application/` e `infrastructure/`, y la
dependencia apunta siempre hacia adentro. `pnpm arch` falla el build si se rompe.

Antes de tocar el código: [`docs/DISENO.md`](docs/DISENO.md).

---

## 9. Despliegue

Dos aplicaciones en Dokploy sobre un VPS, con Postgres y almacenamiento S3 compatible.
Variables, migraciones, memoria y rotación de logs en [`docs/DEPLOY.md`](docs/DEPLOY.md).

```bash
pnpm build          # compilar
pnpm db:deploy      # migrar
pnpm admin:create --email tu@correo.com --name "Tu Nombre"   # una sola vez
```

En el servidor, esos dos últimos pasos se hacen desde la terminal del contenedor de la API:
`./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma` y
`node tools/create-admin.js --email … --name "…"`.

---

## 10. Solución de problemas

| Síntoma | Causa y arreglo |
|---|---|
| `Environment variable not found: DATABASE_URL` | falta `.env` (sección 3) |
| `pg_isready` no responde | `brew services start postgresql@16` |
| Un archivo subido no se descarga | comprueba `STORAGE_LOCAL_DIR`: es relativa al directorio desde el que arranca la API |
| `InvalidAccessKeyId` con `STORAGE_DRIVER=s3` | las llaves no corresponden al endpoint del bucket |
| `429` en el primer acceso de `pnpm test:e2e` | límite de accesos agotado: reinicia la API o sube `RATE_LIMIT_AUTH_PER_15M` |
| `pnpm test:e2e` falla en el primer test | la API no está levantada o la base no está sembrada |
| El correo no llega | en local nada sale a internet: míralo en http://localhost:8025 |
| `next build` muere sin mensaje | falta memoria: compila con más RAM o activa swap |
