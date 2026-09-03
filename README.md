# Pagaré Digital

Herramienta para emitir pagarés, mandarlos a firmar y llevar el control del cobro.
El administrador opera desde un panel web; el cliente firma y consulta desde iOS.

El diseño completo, con sus decisiones y sus motivos, está en **[`docs/PLAN.md`](docs/PLAN.md)**.

## Qué resuelve

| El administrador puede | Dónde |
|---|---|
| Emitir un pagaré y mandarlo a firmar en un paso | `/pagares/nuevo` |
| Ver qué hacer hoy: vencen, promesas rotas, sin gestión | `/` |
| Filtrar la cartera por once vistas | `/pagares` |
| Registrar abonos con desglose de interés y capital | detalle del pagaré |
| Prorrogar, renovar, convenir con quita, castigar o anular | detalle del pagaré |
| Consultar antigüedad de saldos y nueve reportes | `/cartera`, `/reportes` |
| Descargar pagaré, recibo, estado de cuenta y finiquito | detalle y clientes |
| Saber cuánto debe si paga tal día, con su interés | detalle del pagaré |
| Armar el paquete legal en zip para el abogado | detalle del pagaré |
| Mandar un documento por correo, con el PDF adjunto | detalle del pagaré |
| Decidir qué se avisa y cuándo, y ver el correo antes | `/ajustes` |
| Importar la cartera que ya existe desde CSV | `/clientes` |
| Cambiar su contraseña o recuperarla con un código | `/ajustes`, `/login` |
| Dar de alta clientes y gestionar sus accesos | `/usuarios` |

El cliente entra a la app iOS, firma su pagaré, ve cuánto debe y descarga sus recibos.
Es de **sólo lectura salvo firmar**.

## Stack

| Pieza | Qué es |
|---|---|
| `apps/api` | NestJS 11 · única puerta a base de datos y almacenamiento |
| `apps/web` | Next.js 15 App Router · panel del administrador y vista pública |
| `packages/contracts` | Schemas zod, tipos y códigos de error. Fuente única para api y web |
| `packages/domain-rules` | Reglas puras: dinero, calendario, interés, cartera, importe en letra |
| `packages/api-core` | Clases base: casos de uso, unidad de trabajo, paginación |
| `packages/emails` | Plantillas de correo sobre un layout común |

PostgreSQL para los datos, MinIO (compatible con S3) para las firmas y los PDFs, Resend
para el correo y APNs para el push a iOS. **Sin cola ni Redis**: el trabajo pesado corre en
la petición y los avisos se despachan tras confirmar la transacción.

## Ponerlo a correr

Requisitos: Node 22, pnpm 11, PostgreSQL 16+, MinIO y Mailpit.

```bash
# 1. Servicios locales (Homebrew)
brew install postgresql@16 minio mailpit
brew services start postgresql@16
brew services start mailpit
minio server .local/minio-data --address :9000 --console-address :9001 &

# 2. Base de datos
psql -d postgres -c "CREATE ROLE pagares LOGIN PASSWORD 'pagares_local' CREATEDB"
psql -d postgres -c "CREATE DATABASE pagares OWNER pagares"

# 3. Entorno
cp .env.example .env      # rellena los secretos con: openssl rand -base64 48

# 4. Dependencias, esquema y datos de prueba
pnpm install
pnpm db:migrate
pnpm db:seed

# 5. Arrancar
pnpm dev
```

Panel en `http://localhost:3000`, API en `http://localhost:3001`, correos en
`http://localhost:8025`.

El seed deja un administrador: `admin@pagares.local` / `Demo-Pagares-2026`, tres deudores
y quince pagarés repartidos en todos los estados, para que ninguna pantalla se pruebe vacía.

En producción, el primer administrador se crea con `pnpm admin:create`: imprime la
contraseña una sola vez y falla si ya existe uno.

## Comandos

```bash
pnpm dev            # api y web en modo desarrollo
pnpm verify         # lint + typecheck + pruebas + regla de arquitectura
pnpm test:e2e       # BOLA, BFLA y ciclo de vida contra la API levantada
pnpm perf:k6        # carga de §22.1: 100 usuarios, 30 minutos
pnpm db:migrate     # migración de desarrollo
pnpm db:seed        # datos de demostración
pnpm admin:create   # primer administrador
```

`pnpm test:e2e` necesita la API arriba y la base sembrada. Abre varias sesiones seguidas,
así que en local conviene subir `RATE_LIMIT_AUTH_PER_15M` (§25.7): con el valor de
producción —diez accesos por IP cada quince minutos— la suite falla por el límite de tasa
y no por lo que prueba.

`pnpm verify` es la puerta: si no pasa, no está listo.

## Decisiones que conviene conocer antes de tocar el código

**El dinero son enteros de centavos** (`BigInt`), nunca coma flotante. Un pagaré de
$25,000.00 no puede persistirse como 24,999.999999.

**El estado del pagaré se deriva, no se teclea.** Lo calculan el saldo y el reloj; sólo
anular, castigar, convenir y renovar son manuales, y las cuatro piden motivo.

**Vencido no es cartera vencida.** Vencido es un día de atraso; cartera vencida son
90 días naturales. Son dos campos distintos y confundirlos deforma los indicadores.

**Castigar no es perdonar.** El pagaré sale de la cartera activa, pero la deuda sigue
siendo exigible y admite abonos como recuperación.

**El libro de abonos es sólo de anexar.** Anular un abono asienta una reversa con importe
negativo; la fila original nunca se modifica. El saldo guardado en el pagaré es una copia
del libro, y Ajustes enseña si alguna se ha desviado —y deja recalcularla desde ahí, con
rastro en la bitácora.

**Las fechas civiles no tienen zona.** Se comparan contra hoy en `America/Mexico_City`.
Usar UTC hace que un vencimiento se marque un día antes.

**Nada se dispara solo.** No hay cron ni cola: los recordatorios se mandan cuando el
administrador lo decide, desde la bandeja de Hoy. Lo que sí está en tabla es **qué** se
dice: la regla del tramo elige la plantilla, y mandar dos veces el mismo día no manda dos
correos.

**Firmado no siempre es firmado en pantalla.** La cartera importada entra con
`signatureMode = PAPER`: cuenta como firmada, y no genera certificado de evidencia. Fingir
una firma electrónica que nunca existió le quitaría valor a las que sí lo tienen.

**Castigar y perdonar se confirman escribiendo el folio.** Lo comprueba el servidor, no la
pantalla: son las dos acciones con impacto económico irreversible.

## Cómo está organizado

Cada módulo de la API tiene tres capas y la dependencia siempre apunta hacia adentro:

```
infrastructure  →  application  →  domain
(Nest, Prisma,     (casos de uso)   (entidades, reglas,
 sharp, S3)                          puertos)
```

`domain/` no importa NestJS, Prisma ni sharp, y ningún módulo importa la infraestructura
de otro. **No es una convención de buena voluntad**: `pnpm arch` falla el build si se rompe.

## Decisiones registradas

Las que cambian el plan o un límite de seguridad viven en **[`docs/adr/`](docs/adr/)**, una
por archivo y con sus alternativas descartadas. Empezar por ahí ahorra volver a discutir lo
mismo en tres semanas.

## Despliegue

Dos aplicaciones en Dokploy sobre un VPS. Los pasos, las variables y el detalle de las
migraciones están en **[`docs/DEPLOY.md`](docs/DEPLOY.md)**.

## Uso de IA

El proyecto se construyó con Claude Code. El plan de arquitectura, el código y las pruebas
se escribieron en esa colaboración; las decisiones de negocio —alcance, política de
contraseñas, canales de aviso, qué queda fuera— las tomó el responsable del producto.

Vale la pena señalar tres correcciones que sólo aparecieron al ejecutar el sistema, no al
leerlo: una actualización de saldo que se perdía porque las escrituras salían fuera de la
transacción, el filtro de errores sin registrar que convertía un 422 en un 500 genérico, y
las fechas civiles que retrocedían un día en el panel. Las tres estaban en código que
compilaba y pasaba el typecheck.
