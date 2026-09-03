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
| **Archivos** | S3 compatible (MinIO en local, R2/S3 en producción) |
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
| MinIO | cualquiera |
| Mailpit | cualquiera |

```bash
# macOS
brew install node pnpm postgresql@16 minio mailpit

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

MinIO debe arrancar con **las mismas credenciales** que después irán en `.env`; si no
coinciden, las subidas fallan con `InvalidAccessKeyId`.

```bash
brew services start postgresql@16
brew services start mailpit

MINIO_ROOT_USER=pagares MINIO_ROOT_PASSWORD=pagares_local \
  minio server .local/minio-data --address :9000 --console-address :9001 &
```

Verificar:

```bash
pg_isready                                                                       # accepting connections
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9000/minio/health/live # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8025                   # 200
```

### 2.3 Crear la base de datos y el bucket

```bash
psql -d postgres -c "CREATE ROLE pagares LOGIN PASSWORD 'pagares_local' CREATEDB"
psql -d postgres -c "CREATE DATABASE pagares OWNER pagares"
mkdir -p .local/minio-data/pagares-media
```

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

`.env.example` documenta todas las variables. En desarrollo solo hay que rellenar cinco:

| Variable | Valor en local |
|---|---|
| `STORAGE_ACCESS_KEY` | `pagares` |
| `STORAGE_SECRET_KEY` | `pagares_local` |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | otro distinto del anterior |
| `BOOTSTRAP_ADMIN_EMAIL` | tu correo |

Las de Resend y APNs pueden quedar vacías: el correo va a Mailpit y el push queda apagado.

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
| Consola de MinIO | http://localhost:9001 |

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
| `pnpm test:e2e` | pruebas de extremo a extremo (requiere la API levantada) |
| `pnpm perf:k6` | prueba de carga (requiere k6) |
| `pnpm lint` · `pnpm typecheck` | por separado |
| `pnpm arch` | verifica la regla de dependencias entre capas |
| `pnpm db:migrate` | crea y aplica una migración de desarrollo |
| `pnpm db:deploy` | aplica migraciones pendientes (producción) |
| `pnpm db:seed` | datos de demostración |
| `pnpm admin:create` | crea el primer administrador en un entorno vacío |

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
| `POST` | `/webhooks/resend` | firma HMAC del proveedor |

El contrato de cada cuerpo y cada respuesta vive en `packages/contracts`: schemas zod que
consumen tanto la API como el panel, de modo que no hay dos definiciones del mismo campo.

---

## 7. Pruebas

```bash
pnpm verify         # 265 unitarias + lint + typecheck + arquitectura
pnpm test:e2e       # 37 de extremo a extremo contra la API real
```

Las unitarias cubren las reglas puras, los contratos y las plantillas. Las de extremo a
extremo necesitan la API levantada y la base sembrada, y comprueban lo que las unitarias no
pueden: autorización por objeto y por función, idempotencia y el ciclo de vida completo.

```bash
pnpm dev            # en una terminal
pnpm test:e2e       # en otra
```

---

## 8. Estructura

```
apps/
  api/                  API NestJS
    prisma/             esquema y migraciones
    src/modules/        un módulo por responsabilidad
    test/               pruebas de extremo a extremo y de carga
  web/                  Panel Next.js
    src/app/            rutas (App Router)
    src/features/       vistas y acciones de servidor
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
pnpm db:deploy      # migrar (paso previo al arranque, nunca dentro del contenedor)
pnpm admin:create   # primer administrador, una sola vez
```

---

## 10. Solución de problemas

| Síntoma | Causa y arreglo |
|---|---|
| `Environment variable not found: DATABASE_URL` | falta `.env` (sección 3) |
| `pg_isready` no responde | `brew services start postgresql@16` |
| `InvalidAccessKeyId` al subir un archivo | MinIO arrancado con credenciales distintas a las de `.env` |
| `NoSuchBucket` | `mkdir -p .local/minio-data/pagares-media` |
| `429` en el primer acceso de `pnpm test:e2e` | límite de accesos agotado: reinicia la API o sube `RATE_LIMIT_AUTH_PER_15M` |
| `pnpm test:e2e` falla en el primer test | la API no está levantada o la base no está sembrada |
| El correo no llega | en local nada sale a internet: míralo en http://localhost:8025 |
| `next build` muere sin mensaje | falta memoria: compila con más RAM o activa swap |
