# Pagaré Digital

Herramienta para emitir pagarés, mandarlos a firmar y llevar el control del cobro. El
administrador opera desde un panel web; el cliente firma y consulta desde iOS.

Este archivo explica **cómo ponerlo a correr**, paso a paso. El diseño y sus motivos están
en [`docs/PLAN.md`](docs/PLAN.md), y las decisiones tomadas después en
[`docs/adr/`](docs/adr/). Para desplegarlo en un servidor, [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## 1. Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node | 22 o superior | ejecutar api y web |
| pnpm | 11.4 (el que fija `packageManager`) | gestor del monorepo |
| PostgreSQL | 16 o superior | base de datos |
| MinIO | cualquiera | almacenamiento de firmas y anexos |
| Mailpit | cualquiera | buzón de correo local |

En macOS con Homebrew:

```bash
brew install node pnpm postgresql@16 minio mailpit
```

Comprueba que están:

```bash
node -v && pnpm -v && postgres -V
```

---

## 2. Servicios locales

Arranca los tres. **MinIO necesita las mismas credenciales que pondrás en `.env`**; si no
coinciden, las subidas fallan con `InvalidAccessKeyId`.

```bash
# Postgres y Mailpit como servicios
brew services start postgresql@16
brew services start mailpit

# MinIO, con usuario y contraseña propios
MINIO_ROOT_USER=pagares MINIO_ROOT_PASSWORD=pagares_local \
  minio server .local/minio-data --address :9000 --console-address :9001 &
```

Comprueba que responden:

```bash
pg_isready                                   # → accepting connections
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9000/minio/health/live   # → 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8025                     # → 200
```

---

## 3. Base de datos y bucket

```bash
# Rol y base
psql -d postgres -c "CREATE ROLE pagares LOGIN PASSWORD 'pagares_local' CREATEDB"
psql -d postgres -c "CREATE DATABASE pagares OWNER pagares"

# Bucket privado para las firmas y los anexos
mkdir -p .local/minio-data/pagares-media
```

Comprueba la base:

```bash
psql -d pagares -c "select 1"                # → 1 fila
```

---

## 4. Variables de entorno

```bash
cp .env.example .env
```

Abre `.env` y rellena **los cinco valores vacíos** que hacen falta en local:

| Variable | Qué poner |
|---|---|
| `STORAGE_ACCESS_KEY` | `pagares` (el `MINIO_ROOT_USER` del paso 2) |
| `STORAGE_SECRET_KEY` | `pagares_local` (el `MINIO_ROOT_PASSWORD`) |
| `JWT_ACCESS_SECRET` | genera uno: `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | genera **otro distinto** |
| `BOOTSTRAP_ADMIN_EMAIL` | tu correo, para el primer administrador |

El resto ya viene con valores de desarrollo. Las de Resend y APNs se quedan vacías: en
local el correo va a Mailpit y el push queda apagado.

> `.env` está en `.gitignore` y no debe subirse nunca.

---

## 5. Dependencias, esquema y datos de prueba

```bash
pnpm install        # instala todo el monorepo
pnpm db:migrate     # crea las tablas
pnpm db:seed        # datos de demostración
```

`pnpm db:seed` se puede repetir cuantas veces quieras: no duplica nada.

Al terminar imprime:

```
Seed listo: 3 deudores, 12 pagarés y 7 reglas de aviso.
Administrador: admin@pagares.local / Demo-Pagares-2026
```

---

## 6. Arrancar

```bash
pnpm dev
```

| Dónde | URL |
|---|---|
| Panel | http://localhost:3000 |
| API | http://localhost:3001/api/v1 |
| Correos | http://localhost:8025 |
| Consola de MinIO | http://localhost:9001 |

Entra al panel con `admin@pagares.local` / `Demo-Pagares-2026`.

Los datos de prueba dejan pagarés en todos los estados —por firmar, vigentes, vencidos,
liquidados, castigados y anulados— para que ninguna pantalla se vea vacía.

---

## 7. Comandos

```bash
pnpm dev            # api y web en desarrollo
pnpm verify         # lint + typecheck + pruebas + regla de arquitectura
pnpm test:e2e       # pruebas contra la API levantada
pnpm perf:k6        # prueba de carga (necesita k6 instalado)
pnpm db:migrate     # aplicar una migración nueva
pnpm db:seed        # recargar datos de demostración
pnpm admin:create   # crear el primer administrador en un entorno vacío
pnpm build          # compilar api y web para producción
```

**`pnpm verify` es la puerta**: si no pasa, no está listo para subir.

`pnpm admin:create` imprime la contraseña una sola vez y falla si ya existe un
administrador. Es lo que se usa en producción, donde no se ejecuta el seed.

---

## 8. Si algo falla

| Síntoma | Causa y arreglo |
|---|---|
| `pg_isready` no responde | Postgres no está arrancado: `brew services start postgresql@16` |
| `Environment variable not found: DATABASE_URL` | falta el `.env` (paso 4) o lo copiaste en otra carpeta |
| Al subir un archivo: `InvalidAccessKeyId` | las credenciales de MinIO no coinciden con `STORAGE_ACCESS_KEY` y `STORAGE_SECRET_KEY`. Arranca MinIO como en el paso 2 |
| `NoSuchBucket` | falta el bucket: `mkdir -p .local/minio-data/pagares-media` |
| El panel no responde a los clics | recarga sin caché; en desarrollo el navegador puede quedarse con JavaScript viejo |
| `pnpm test:e2e` da 429 en el primer acceso | límite de accesos agotado. Reinicia la API, o sube `RATE_LIMIT_AUTH_PER_15M` en tu `.env` local |
| `pnpm test:e2e` falla nada más empezar | la API no está levantada o la base no está sembrada: `pnpm dev` y `pnpm db:seed` |
| El correo no llega | míralo en http://localhost:8025; en local nada sale a internet |
| `next build` muere sin mensaje | falta memoria. Cierra procesos o compila con más RAM disponible |

---

## 9. Cómo se prueba

```bash
pnpm verify         # 265 pruebas unitarias y la regla de arquitectura
pnpm test:e2e       # 37 pruebas contra la API real, incluidas las de autorización
```

Las de extremo a extremo necesitan la API levantada y la base sembrada. Comprueban lo que
las unitarias no pueden: que los guards, las transacciones y los permisos funcionan juntos
—entre ellas, que un cliente no puede ver ni descargar nada de otro.

---

## 10. Estructura del repositorio

```
apps/api        API (NestJS)
apps/web        Panel del administrador y vista pública (Next.js)
packages/       Código compartido entre las dos aplicaciones
docs/           Plan de arquitectura, guía de despliegue y decisiones
```

Si vas a **tocar el código**, lee antes [`docs/DISENO.md`](docs/DISENO.md): son las reglas
que el proyecto da por sentadas y que no se deducen leyendo un archivo suelto.

---

## Uso de IA

El proyecto se construyó con Claude Code. El plan de arquitectura, el código y las pruebas
se escribieron en esa colaboración; las decisiones de negocio —alcance, política de
contraseñas, canales de aviso, qué queda fuera— las tomó el responsable del producto.
