# Plan de arquitectura — Pagaré Digital (API + Web)

> **v3 · consolidado.** Cada dato aparece en **una sola sección**; las demás lo referencian. Si encuentras el mismo hecho escrito dos veces, es un error a reportar.
> **Alcance del repo:** `apps/api` (NestJS) · `apps/web` (Next.js). iOS vive fuera, pero el contrato lo sirve sin cambios.
> **No se escribe código hasta que apruebes este documento.**

## Índice de autoridad (dónde vive cada verdad)

| Tema | Sección única |
|---|---|
| **Propósito y qué controla** | **§0** |
| Principios y prohibiciones | §1 |
| Estructura del repo | §2 |
| Módulos y su responsabilidad | §3 |
| Eventos de dominio | §3.3 |
| Patrones de diseño | §4 |
| Clases base | §5 |
| Escalabilidad | §6 |
| SOLID | §7 |
| Imágenes y firma | §8 |
| Seguridad OWASP | §9 |
| Usuarios, contraseñas, OTP, tokens | §10 |
| Estados del pagaré y transiciones | §11 |
| Dinero, interés, saldo, abonos | §12 |
| Cartera, cobranza, convenios, legal | §13 |
| Modelo de datos completo | §14 |
| Endpoints (tabla única) | §15 |
| Correos | §16 |
| Documentos PDF y reportes | §17 |
| Trabajo en segundo plano | §18 |
| Dashboard | §19 |
| Equipo (skills), hooks y CI | §20 |
| Fases de entrega | §21 |
| No funcionales y riesgos | §22 |
| Glosario | §23 |
| **Refuerzos de producto** | **§24** |
| **Detalles de implementación** | **§25** |
| Decisiones cerradas | §26 |
| Pendiente de ti | §27 |

---

## 0. Propósito

**Qué es.** Una herramienta para que **tú controles los pagarés que emites a tus clientes**, de punta a punta: los generas, se los mandas a firmar, y a partir de ahí el sistema te dice qué vence, quién debe, cuánto de mora lleva, qué se le cobró y qué falta. El objetivo no es "digitalizar un formulario": es que **no lleves nada en la cabeza ni en Excel**.

**Quién lo usa.**

| Rol | Dónde | Qué hace |
|---|---|---|
| **Administrador** (tú) | Dashboard web | Emite el pagaré, crea la cuenta del cliente, lo manda a firmar, registra abonos, gestiona la cobranza y ve toda la cartera |
| **Cliente** | App iOS | Recibe su acceso, **firma** el pagaré, consulta cuánto debe y cuándo vence |

El cliente **nunca emite un documento**. Sólo firma y consulta (§15).

**Qué ve y hace el cliente en la app iOS:**

| Pantalla | Contenido | Puede |
|---|---|---|
| **Inicio** | Cuánto debe en total, cuántos pagarés tiene y el **próximo vencimiento** | Entrar al que vence primero |
| **Por firmar** | Los pagarés que le enviaste y aún no firma | Leer el documento completo y **firmar** con el dedo o el Pencil |
| **Mis pagarés** | Lista con folio, importe, **abonado**, **saldo**, vencimiento y días de atraso | Filtrar por vigentes, vencidos y liquidados |
| **Detalle** | El documento con su firma, el **interés moratorio devengado**, y el historial de abonos que registraste | Descargar el PDF del pagaré y los **recibos** de sus abonos |
| **Avisos** | Recordatorios de vencimiento, abonos registrados y liquidaciones, también por **push** | Marcar como leídos |
| **Cómo pagar** | Banco, cuenta, referencia y lugar de pago, desde `settings` | Copiar los datos |

Refuerzos de la app en §24.4: Face ID al abrir, lectura sin señal, agregar el vencimiento al calendario del iPhone, compartir el PDF, y **el botón de firmar deshabilitado hasta recorrer el documento completo**.

**La app es de sólo lectura, con una única excepción: firmar.** No hay ningún otro endpoint de escritura para el rol cliente. No puede emitir, editar, corregir, registrar pagos, subir archivos ni ver nada de otro cliente. Toda consulta filtra por `ownerId` (§9.1, API1), y el guard del rol cliente rechaza por defecto cualquier verbo distinto de `GET`, salvo la ruta de firma.

**Qué significa "control total", traducido a lo que hace el sistema:**

| Lo que quieres controlar | Cómo se resuelve | Dónde |
|---|---|---|
| Emitir el pagaré y mandarlo a firmar | Un solo paso: genera folio, crea la cuenta, envía credenciales y aviso de firma | §19.6 |
| Que el documento sea válido y no manipulable | Requisitos del art. 170, campos derivados en servidor, firma con evidencia (hash, trazo vectorial, dispositivo, IP) y documento no editable tras firmar | §8, §11.3 |
| **Fechas de caducidad** | `dueDate` obligatorio y posterior a la emisión; vencimiento derivado por reloj, con corte diario a las 00:05 de México | §11.2, §12.1 |
| **Pagos realizados** | Abonos libres con método, referencia, recibo en PDF y saldo recalculado en la misma transacción | §12.2, §17.1 |
| **Moras** | Interés moratorio calculado solo, sobre el saldo, con snapshot en cada abono; días de atraso y tramo derivados | §12.3, §11.1 |
| Saber a quién perseguir hoy | Bandeja "Panel": vencen hoy, promesas incumplidas, con atraso sin gestión, firmas pendientes | §19.2 |
| Que los avisos salgan sin que tú los mandes | Reglas de recordatorio en tabla editable: −7, −3, −1, 0, +1, +7, +15, +30 días | §13.1 |
| Renegociar sin perder el hilo | Convenios con quita y vigencia; si se incumple, el saldo original vuelve solo | §13.4 |
| Extender o sustituir un pagaré | Prórroga (conserva la firma) o renovación (documento nuevo, firma nueva) | §13.5 |
| Cerrar los que ya no se van a cobrar | Castigo con motivo, sin dejar de ser exigible; abonos posteriores entran como recuperación | §13.7 |
| Cancelar los emitidos por error | Anulación con motivo. Nada se borra | §11.3 |
| Ver el estado real de la cartera | Vigente vs. vencida (90 días), antigüedad por tramos, saldo por cobrar, cobrado del mes, DSO | §17.2, §19.7 |
| Documentos sin redactarlos a mano | Pagaré, recibo de abono, estado de cuenta y carta de finiquito, automáticos | §17.1 |
| Saber quién hizo qué | Bitácora inmutable de toda acción sensible, con actor, IP y momento | §9.3 |
| Si hay que demandar | Expediente judicial, actuaciones y ubicación del **pagaré original en papel** | §13.6 |

**Encuadre regulatorio.** Esto es una herramienta de **control interno de un acreedor particular**, no un producto para una entidad financiera regulada. Por eso quedan fuera —con el puerto listo por si algún día aplica— el reporte a Buró de Crédito, el régimen completo de prevención de lavado y las provisiones contables automáticas (§26, punto 14). Si en algún momento operas como SOFOM registrada, esos tres dejan de ser opcionales y hay que planearlos aparte.

---
## 1. Principios rectores

| Principio | Traducción operativa |
|---|---|
| **Responsabilidad única por módulo** | Un módulo = un concepto del dominio. Ningún módulo importa el repositorio, la entidad ni la tabla de otro. Se comunican por **puertos inyectados** o **eventos** (§3.2, §3.3). |
| **Una verdad, un lugar** | Reglas compartidas entre api y web en `packages/contracts` y `packages/domain-rules`. Prohibido reimplementar una regla en el front. |
| **Cuerpo base para todo servicio** | Casos de uso, repositorios, mappers, controladores, procesadores de cola y errores heredan de una base común (§5). |
| **KISS / YAGNI** | Monolito modular, no microservicios. Puerto sólo donde hay algo real que sustituir: storage, compresor, mailer, PDF, reloj, hasher. |
| **Dominio puro** | `domain/` no importa NestJS, Prisma, HTTP ni `fs`. Verificado por `dependency-cruiser` en CI (§20). |
| **Stateless** | Ningún estado en memoria del proceso. Todo lo lento va a cola (§18). |
| **Seguridad por defecto** | Sin guard explícito, la ruta no responde. OWASP API y Web mapeados a controles (§9). |
| **El servidor es la autoridad** | Todo campo derivado —folio, importe en letra, estado, saldo, interés, clasificación— se calcula en el servidor. El cliente nunca los envía. |
| **Nada se borra** | Abonos, pagarés y credenciales se anulan o revocan con motivo y actor. `UPDATE` silencioso sobre un documento de crédito es un defecto. |

**Prohibido explícitamente:** servicios "God", lógica de negocio en controladores o en Server Actions, Prisma dentro de un caso de uso, `any`, catch silencioso, números mágicos, y cualquier regla escrita dos veces.

---

## 2. Estructura del monorepo

```
pagares-webApi-demo/
├── apps/
│   ├── api/                    # NestJS 11 — única puerta a DB, storage y cola
│   └── web/                    # Next.js 15 App Router — dashboard + vista pública
├── packages/
│   ├── contracts/              # zod schemas, tipos y códigos de error (§14.4)
│   ├── domain-rules/           # reglas puras: dinero, calendario, interés, política de contraseña
│   ├── api-core/               # clases base de §5
│   ├── emails/                 # plantillas React Email (§16)
│   └── config-{eslint,ts,tailwind}/
├── docker/                     # compose de referencia: postgres, minio, mailpit
└── docs/{PLAN.md, openapi.yaml, adr/}
```

**pnpm workspaces + Turborepo** · Node 22 LTS · TypeScript strict con `noUncheckedIndexedAccess`.

`packages/contracts` es lo que impide la duplicación entre api y web: un schema se declara una vez, la API lo usa como pipe de validación y para generar OpenAPI, y la web lo usa para tipar formularios y cliente HTTP. Cambiar un campo rompe la compilación en ambos lados.

---

## 3. Módulos

Arquitectura hexagonal por módulo. La dependencia siempre apunta hacia adentro: `infrastructure → application → domain`.

### 3.1 Catálogo y responsabilidad única

| Módulo | Su única responsabilidad | Lo que **no** le corresponde |
|---|---|---|
| `promissory-notes` | Ciclo de vida del pagaré: emitir, consultar, prorrogar, renovar, anular, castigar, y derivar su estado | Comprimir imágenes · calcular interés · enviar correo · generar PDF |
| `signatures` | Vincular el trazo firmado con su pagaré y custodiar la **evidencia** (hash, metadatos de captura, IP) | Procesar bytes de imagen (eso es `media`) |
| `media` | Bytes: validar, comprimir, derivar miniaturas, almacenar y firmar URLs. Sin saber qué representan | Cualquier regla de negocio |
| `debtors` | Identidad y contacto del deudor, su expediente y su comportamiento de pago | Montos, vencimientos, cobranza |
| `payments` | Abonos: registrar, anular y recalcular saldo | Decidir el estado del pagaré (lo pide a `promissory-notes`) · calcular interés |
| `interest` | Cálculo puro del interés moratorio y su snapshot | Decidir cuándo se cobra o cómo se aplica el abono |
| `settlements` | Convenios, quitas y reestructuras, y su cumplimiento o ruptura | Registrar el dinero (lo hace `payments`) |
| `collections` | Reglas de recordatorio, tramos de gestión, bitácora de contactos y promesas de pago | Enviar el mensaje (lo hace `notifications`) |
| `legal` | Expediente judicial, custodia del documento físico y actuaciones | Decidir si se demanda |
| `numbering` | Secuencias de folio por tipo de documento y año | Saber qué es un pagaré |
| `settings` | Configuración de la organización y valores por defecto | Aplicarlos (los consumen los casos de uso) |
| `reports` | **Sólo lectura**: aging, clasificación, indicadores, agregados y exportaciones | Escribir cualquier cosa · renderizar PDFs |
| `documents` | Renderizar **todos** los PDFs desde un DTO de presentación | Leer de la base de datos |
| `notifications` | Entregar mensajes por el puerto `Mailer` / `NotificationChannel` | Construir el PDF ni decidir a quién avisar |
| `users` | Cuentas de acceso: alta por admin, estado, perfil | Autenticar |
| `credentials` | Contraseñas: generación, hash, política, historial, revocación de sesiones | Saber quién es admin |
| `otp` | Códigos de un solo uso **para cambio y recuperación de contraseña** | Enviar el correo |
| `auth` | Login, emisión y rotación de tokens, guards | Autorización de negocio (vive en `authorize()` del caso de uso) |
| `public-access` | Proyección de solo lectura por `publicToken`, sin PII | Cualquier escritura |
| `audit` | Bitácora inmutable de acciones sensibles y claves de idempotencia | Interpretar el negocio |
| `notifications` | Entregar el correo y despachar los avisos pendientes (§18.1) | Saber qué significa cada evento |
| `health` | Liveness y readiness de base de datos, storage y correo | Nada más |

### 3.2 Cómo se comunican

Tres vías, y ninguna más:

1. **Puerto inyectado** cuando el caso de uso necesita una capacidad: `CreateNoteUseCase` recibe `NoteRepository`, `NumberSequence`, `Clock`. Depende de la interfaz del dominio, jamás de la clase concreta.
2. **Evento de dominio** cuando algo ya ocurrió y otro módulo debe reaccionar. El emisor no sabe quién escucha.
3. **Consulta de lectura** a `reports`, que no escribe nunca y puede leer proyecciones de varios módulos sin romper el aislamiento de escritura.

Lo que está prohibido: importar el repositorio de otro módulo, leer su tabla directamente, o llamar a su caso de uso desde un controlador ajeno.

### 3.3 Catálogo de eventos de dominio

Un evento por hecho consumado. Nombre en pasado, siempre.

| Evento | Lo emite | Lo consumen |
|---|---|---|
| `UserCreated` | `users` | `notifications` (correo 1 o 2) |
| `PasswordReset` | `credentials` | `notifications` (correo 5), `auth` (revoca sesiones) |
| `AccountLocked` | `auth` | `notifications` (correo 13), `audit` |
| `NoteIssued` | `promissory-notes` | `notifications` (correo 2), `collections` (programa recordatorios) |
| `SignatureReceived` | `signatures` | `media` (encola compresión) |
| `SignatureProcessed` | `media` | `promissory-notes` (pasa a `ISSUED`), `documents` (genera el PDF) |
| `NoteSigned` | `promissory-notes` | `notifications` (correo 6 con PDF) |
| `PaymentRegistered` | `payments` | `promissory-notes` (recalcula estado), `documents` (recibo), `notifications` (correos 9 y 15) |
| `PaymentVoided` | `payments` | `promissory-notes` (recalcula), `audit` |
| `NoteSettled` | `promissory-notes` | `documents` (finiquito), `notifications` (correos 10 y 17) |
| `SettlementCreated` · `SettlementBroken` | `settlements` | `promissory-notes` (cambia estado), `notifications` (correos 19 y 20) |
| `NoteExtended` · `NoteRenewed` | `promissory-notes` | `notifications` (correo 18), `collections` (reprograma) |
| `NoteWrittenOff` · `NoteVoided` | `promissory-notes` | `audit`, `reports` |
| `PromiseMade` · `PromiseBroken` | `collections` | `notifications` (correo 21), bandeja de Hoy |
| `LegalCaseOpened` | `legal` | `collections` (congela recordatorios automáticos) |

**Cómo se publican, sin perder ninguno — patrón outbox.** Publicar "después del commit" parece correcto pero pierde eventos: si el proceso muere entre el `COMMIT` y el `publish`, el hecho quedó guardado y **nadie se enteró** — el abono existe y el recibo nunca se genera. La solución establecida es el **outbox transaccional**:

1. El caso de uso escribe el cambio **y** la fila `OutboxMessage` **en la misma transacción**. O se guardan los dos, o ninguno.
2. Un relay (`outbox-relay`, §18) lee las pendientes y las publica a la cola.
3. Marca la fila como publicada. Si el relay muere antes de marcarla, la vuelve a publicar.

Eso da **entrega al menos una vez**, así que **todo handler debe ser idempotente**: antes de actuar registra `(eventId, handler)` en `ProcessedEvent`; si ya está, no hace nada. Sin esa segunda mitad, un reintento manda dos recibos.

Un handler que falla **no revierte lo ya guardado**: se reintenta desde la cola y, agotados los reintentos, cae a la dead-letter queue con alerta.

### 3.4 Árbol de un módulo (plantilla del skill `arquitecto-modulo`)

```
modules/<modulo>/
├── domain/
│   ├── <entidad>.entity.ts          # constructor privado + factory create()
│   ├── value-objects/*.vo.ts
│   ├── events/*.event.ts
│   ├── errors/*.error.ts            # extienden BaseDomainError, nunca HttpException
│   └── ports/*.ts                   # interfaces, sin dependencias externas
├── application/
│   ├── use-cases/*.use-case.ts      # extienden BaseUseCase
│   ├── dto/                         # derivados de packages/contracts
│   └── mappers/*.mapper.ts          # extienden BaseMapper
└── infrastructure/
    ├── http/{*.controller.ts, *.presenter.ts}
    ├── persistence/prisma-*.repository.ts   # extiende BasePrismaRepository
    ├── queue/*.processor.ts                 # extiende BaseQueueProcessor
    └── <modulo>.module.ts                   # wiring: provide(TOKEN, useClass)
```

---

## 4. Patrones de diseño

| Patrón | Dónde | Qué problema resuelve |
|---|---|---|
| **Ports & Adapters** | `domain/ports` + `infrastructure` | Dominio testeable sin Docker; MinIO↔S3, Resend↔SMTP intercambiables |
| **Template Method** | Todas las clases base de §5 | Cuerpo común, sólo se implementa lo que varía |
| **Repository** | Un repositorio por agregado | Aísla Prisma del caso de uso |
| **Specification** | Filtros de listado y de reportes | Componer criterios sin condicionales anidados |
| **Value Object** | `Money`, `Folio`, `Email`, `Phone`, `InterestRate`, `DateRange` | Imposible construir un valor inválido |
| **Factory Method** | `PromissoryNote.issue()`, `Payment.register()`, `User.invite()` | No existe entidad en estado inválido |
| **State** | `NoteStatus` (§11), `UserStatus` (§10.1), `SettlementStatus` | Transiciones legales en un solo lugar |
| **Strategy** | `ImageCompressor`, `Mailer`, `PdfRenderer`, `PasswordHasher`, `NotificationChannel`, `ObjectStorage` | Sustituir sin cascada |
| **Chain of Responsibility** | Pipeline de imágenes (§8.4) y cadena de guards/pipes | Un eslabón, una responsabilidad |
| **Decorator** | Interceptors: traceId, logging, idempotencia, caché | Cross-cutting fuera del dominio |
| **Observer** | Eventos de §3.3 | Desacopla "pasó X" de "hay que avisar" |
| **Unit of Work + compensación** | Transacción de Postgres + borrado del objeto en el `catch` | Nunca un pagaré apuntando a una firma inexistente |
| **DTO + Mapper** | `application/mappers` | La forma de la base no llega a la API ni al front |
| **Presenter** | `*.presenter.ts` | Formateo de moneda y fechas fuera del dominio |

---

## 5. Clases base (`packages/api-core`)

```ts
export abstract class BaseUseCase<TInput, TOutput> {
  protected abstract handle(input: TInput, ctx: ExecutionContext): Promise<TOutput>;
  protected authorize?(input: TInput, ctx: ExecutionContext): Promise<void>;

  async execute(input: TInput, ctx: ExecutionContext): Promise<TOutput> {
    const started = performance.now();
    try {
      await this.authorize?.(input, ctx);
      const output = await this.handle(input, ctx);
      await this.events.flushAfterCommit();   // §3.3: los eventos salen tras confirmar
      return output;
    } catch (error) {
      throw toDomainError(error);
    } finally {
      this.logger.trace({ useCase: this.constructor.name, ms: performance.now() - started, traceId: ctx.traceId });
    }
  }
}
```

| Base | Da gratis | Se implementa |
|---|---|---|
| `BaseUseCase<TIn,TOut>` | traceId, logging, medición, normalización de errores, publicación de eventos tras commit, hook `authorize` | `handle()` |
| `BasePrismaRepository<TModel,TEntity>` | `findById`, `findMany` con cursor, `count`, `create`, `update`, `withTransaction`, `lockForUpdate`, mapeo a entidad | `toEntity()`, `toPersistence()`, `model` |
| `BaseMapper<TEntity,TDto>` | `toDto`, `toDtoList` | los dos mapeos |
| `BaseController` | versionado, `@ApiTags`, respuestas de error documentadas, guard por defecto | las rutas |
| `BaseDomainError` | `code` estable, `httpStatus`, `field?`, serialización RFC 9457 | una subclase por error de §14.4 |
| `BaseQueueProcessor<TJob>` | reintento con backoff, idempotencia por clave, dead-letter queue, logging con traceId | `process()` |
| `BaseEventHandler<TEvent>` | aislamiento de fallo: un handler que revienta no tumba a los demás | `on()` |
| `BaseReportQuery<TFilter,TRow>` | paginación, rango de fechas, exportación CSV/XLSX | la consulta |

**Regla anti-abuso:** si una subclase necesita **anular** el comportamiento de la base en vez de completarlo, la base está mal. Se corrige la base.

---

## 6. Escalabilidad

**Objetivo:** miles de usuarios, escala horizontal, sin sobreingeniería.

**API**
- Stateless. Rate limiting con `@nestjs/throttler` en memoria, suficiente con una instancia; si algún día hay varias, el contador debe pasar a un almacén compartido o el límite real se multiplica.
- El trabajo pesado (compresión, PDF, correo) corre dentro de la petición (§18). Con el volumen actual es preferible a operar una cola; el puerto permite moverlo después sin reescribir.
- Postgres con pool dimensionado por instancia (`connection_limit`) y pgbouncer, para no agotar conexiones al escalar. Paginación **por cursor**, nunca `OFFSET` grande. `select` explícito, nunca `include` en cascada; regla anti N+1 verificada en tests con `prisma.$on('query')`.
- Storage S3/R2 con URL prefirmada de 15 min y CDN delante de las miniaturas.

**Web**
- Server Components para la carga inicial; sólo se hidrata lo interactivo.
- Caché etiquetada e invalidada con `revalidateTag` desde la API.
- Tabla con cursor y filtros en la URL; virtualización por encima de 200 filas.
- `next/image` sobre las miniaturas WebP; presupuesto de bundle vigilado en CI.
- Streaming con Suspense: los indicadores no bloquean la tabla.

---

## 7. SOLID, verificado por CI

| Letra | Aplicación concreta |
|---|---|
| **S** | Un caso de uso = una operación. Un archivo por regla en `domain-rules`. El controlador sólo traduce HTTP↔DTO |
| **O** | Un canal de notificación nuevo o un documento nuevo = un adaptador nuevo de un puerto existente; ningún archivo previo se toca |
| **L** | Las implementaciones de un puerto cumplen el contrato **incluidos sus errores tipados**. Un test de contrato compartido corre contra todas |
| **I** | Puertos pequeños y específicos: `SignatureStorage` ≠ `DocumentStorage`. Nada de un `IStorage` con doce métodos |
| **D** | Inyección por tokens `Symbol` en los `*.module.ts`; el caso de uso sólo conoce interfaces |

El CI falla si `domain/` importa `@nestjs/*`, `@prisma/client`, `sharp` o `apps/web`.

---

## 8. Imágenes y firma (`media` + `signatures`)

### 8.1 Qué sube iOS

`PKDrawing` expone `dataRepresentation()` (vector con presión, inclinación y tiempo por punto) y `image(from:scale:)` (raster con alfa). PencilKit no exporta SVG, así que la decisión no es "PNG o SVG" sino qué par de artefactos se conservan. **Sube los dos, en un solo `multipart/form-data`:**

| Parte | Qué es | Tamaño | Para qué |
|---|---|---|---|
| `signature` | PNG @2x del rectángulo de trazos con 12 pt de margen, alfa preservado | ~480 KB | Lo que se ve en app, dashboard y PDF; el servidor lo comprime a WebP |
| `signatureVector` | `PKDrawing.dataRepresentation()` | 8–60 KB | Re-render a cualquier resolución sin volver a pedir la firma, y evidencia forense |
| `payload` | JSON con los metadatos de captura | < 4 KB | Evidencia de aceptación |

Metadatos de captura: `capturedAt`, `strokeCount`, `durationMs`, `bounds`, `scale`, `deviceModel`, `osVersion`, `appVersion`, `inputType`. El servidor añade `ipAddress` y el `sha256` de cada artefacto.

**No base64 en JSON:** infla 33 %, obliga a cargar el cuerpo entero en memoria y ensucia el log. **No el documento completo desde iOS:** el servidor no podría verificar que coincide con los datos que él validó. iOS aporta el trazo; el documento lo compone el servidor (§17).

**Regla de captura:** `drawing.bounds.isEmpty` deshabilita el envío. Se exporta el rectángulo de los trazos, no el lienzo entero.

### 8.2 Recorrido del artefacto

```
iOS                     API                        WORKER                      RESULTADO
firma en PKCanvasView   valida y guarda temporal   pipeline §8.4               dashboard: miniatura 240px
PNG @2x + vector  ────► SignatureReceived    ────► sube a S3, sha256    ────►  detalle: firma sobre el papel
                        responde 202               SignatureProcessed          PDF con alfa (§17)
                        nota en PENDING_SIGNATURE  nota pasa a ISSUED          correo 6 con comprobante
```

**En el backend:** la API valida, comprime y sube en la misma petición (§18). El pagaré pasa a `ISSUED` al terminar. Si la persistencia falla, el objeto se borra en el `catch` — compensación explícita, porque el storage no participa del `ROLLBACK`.

**En iOS:** tras el `202` se muestra la firma local (optimista); al llegar `ISSUED` se sustituye por la miniatura remota, cacheada en disco. Nunca se persiste la URL prefirmada, sólo la clave: la URL caduca a los 15 min.

**En el dashboard:** la tabla usa la miniatura de 240 px — 40 filas pesan ~150 KB, no 20 MB. El detalle usa la imagen completa superpuesta sobre el documento; el alfa evita el recuadro blanco que delata una firma pegada. La URL prefirmada la emite el Server Component en cada carga.

### 8.3 Perfiles de imagen (Strategy como datos)

Añadir un tipo de archivo es añadir una fila, no código.

| Perfil | Entrada | Salida | Límites |
|---|---|---|---|
| `signature` | PNG/JPEG con alfa | WebP q82 con alfa, `trim`, máx 1200×400 + miniatura 240 px | ≤ 5 MB · ≥ 0.2 % de píxeles con tinta |
| `signature-vector` | `.pkdrawing` | Se almacena tal cual, gzip | ≤ 1 MB |
| `document-scan` | PNG/JPEG/HEIC/PDF | WebP q78, máx 2000 px lado largo; PDF sin recomprimir | ≤ 10 MB |
| `legal-exhibit` | PNG/JPEG/PDF | Sin recompresión destructiva | ≤ 20 MB |

### 8.4 Pipeline — el orden es la defensa

1. Límite de tamaño **antes de leer el buffer completo** (`limits` de Multer).
2. Tipo real por **magic bytes** (`sharp.metadata()`), nunca el `Content-Type` del cliente.
3. `limitInputPixels: 40_000_000` — corta la *decompression bomb*.
4. Rechazo de lienzo vacío por media del canal alfa: es la traducción técnica de "no enviar un pagaré sin firmar".
5. `trim` → `resize inside withoutEnlargement` → `rotate()` (aplica EXIF y **descarta metadatos**: el GPS es PII).
6. WebP + miniatura.
7. `sha256` del resultado → clave `signatures/{noteId}/{sha256}.webp`: integridad auditable y deduplicación.

Con `sharp.cache(false)` y `sharp.concurrency(1)` para acotar la memoria del proceso.

**Reducción medida: ~50 %** sobre una muestra sintética con antialias (55 KB → 27 KB), verificada en las pruebas. La cifra de 90 % que citaba el documento original corresponde a exportaciones reales de PencilKit, que no se han podido medir todavía; queda pendiente confirmarla con una firma real cuando exista la app iOS.

### 8.5 Subida directa cuando los archivos crezcan

Para expedientes y anexos grandes: `POST /api/v1/uploads/presign` devuelve una URL de subida directa a S3 con tipo y tamaño acotados; el cliente sube el binario sin pasar por la API y confirma con la clave. La firma (~480 KB) sigue por multipart porque es más simple. **El puerto sirve a las dos vías.**

---

## 9. Seguridad

### 9.1 API — OWASP API Security Top 10 (2023)

| Riesgo | Control |
|---|---|
| **API1 · BOLA** | Toda consulta de cliente filtra por dueño (`ownerId = sub`); el admin tiene acceso total explícito. Test negativo obligatorio por endpoint |
| **API2 · Auth rota** | Detalle completo en §10: argon2id, `pwdVersion`, rotación de refresh con detección de reutilización, bloqueo por cuenta, OTP acotado, respuestas en tiempo constante |
| **API3 · BOPLA** | Salida por allow-list con DTOs explícitos; nunca `return prismaEntity`. Entrada zod `.strict()`: campo extra = 422, lo que mata el mass assignment de `role`, `status`, `ownerId`, `folio` |
| **API4 · Consumo de recursos** | Throttler, body ≤ 1 MB, imagen ≤ 5 MB, `limitInputPixels`, `limit` máximo 100 por página, timeouts de base de datos, storage y correo |
| **API5 · BFLA** | Guard por rol en la ruta **y** `authorize()` en el caso de uso. Guard global por defecto; `@Public()` es la excepción explícita |
| **API6 · Flujos sensibles** | `Idempotency-Key` **obligatoria** en: alta de pagaré, alta de usuario, registro de abono, creación de convenio y castigo. Reglas completas en §12.4. Transiciones validadas por §11. Folio único por índice |
| **API7 · SSRF** | No se acepta ninguna URL del usuario. El PDF no hace fetch remoto: fuentes e imágenes embebidas |
| **API8 · Configuración** | `helmet`, CORS con lista blanca, cookies `httpOnly/Secure/SameSite`, sin `X-Powered-By`, stack traces sólo en dev, bucket privado, env validado con zod al arrancar |
| **API9 · Inventario** | OpenAPI versionado en `/api/v1` y `docs/openapi.yaml` en el repo; lo obsoleto se borra, no se deja "por si acaso" |
| **API10 · Terceros** | Resend y S3 tras puertos con timeout, reintento acotado y validación de respuesta. `pnpm audit` + Dependabot en CI |

### 9.2 Web — OWASP en el front

- **CSP estricta con nonce** por request (sin `unsafe-inline`), `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`, HSTS, en `middleware.ts`.
- **XSS:** `dangerouslySetInnerHTML` prohibido por regla ESLint que rompe el build.
- **CSRF:** cookie `SameSite=Lax` + double-submit token en toda mutación y Server Action.
- **Autorización en el servidor:** ocultar un botón no es un control. Cada Server Action y cada route handler revalida el rol; el layout no basta.
- **Secretos:** nada sensible en `NEXT_PUBLIC_*`; el token vive en cookie `httpOnly`, jamás en `localStorage`.
- **Redirección abierta:** `returnTo` validado contra lista blanca de rutas internas.
- **Rate limit** en login y en Server Actions sensibles.

### 9.3 Auditoría de acciones sensibles

Quedan en `AuditLog` con actor, rol, IP, user-agent y momento: alta y reset de credenciales, desbloqueo, cambio de estado de usuario, anulación de pagaré, castigo y su reversión, anulación de abono, alta de convenio con quita, apertura de expediente legal, y cambios en `settings` y en las reglas de recordatorio. La bitácora es **sólo escritura**: no hay endpoint que la edite ni la borre. Cada registro encadena el hash del anterior (§24.1), y `verify-audit-chain` (§18) detecta cualquier alteración hecha directamente en la base.

---

## 10. Usuarios, contraseñas, OTP y tokens

### 10.1 Estados de la cuenta

`PENDING_ACTIVATION` → `ACTIVE` → (`SUSPENDED`) → (`DISABLED`)

`LOCKED` **no es un estado**: es `lockedUntil` en el tiempo y se levanta solo.

### 10.2 Política

| Regla | Valor |
|---|---|
| Contraseña temporal al crear usuario | Se **envía por correo** y se muestra una vez al admin. Caduca en **72 h**, un solo uso |
| Cambio obligatorio en el primer acceso | Sin cambiarla no hay acceso a ningún otro endpoint |
| Cambios de contraseña por el usuario | Máximo **3 por ventana móvil de 7 días** |
| Reset hecho por el admin | **Pone la cuota a cero** y no la consume |
| Intentos fallidos | **5 → bloqueo de 5 h**, contado **por cuenta**, no por IP |
| Reinicio del contador | Login correcto, o expiración de `lockedUntil` |
| OTP | **Sólo** para cambio y recuperación de contraseña. No hay OTP en el alta ni en el login |
| Parámetros del OTP | 6 dígitos · TTL 10 min · un solo uso · máx 5 intentos · reenvío con 60 s de espera · máx 5/hora |
| Fuerza | ≥ 12 caracteres, contraste contra filtradas por k-anonymity, sin caducidad forzada (NIST SP 800-63B) |
| Reutilización | Prohibido repetir las 5 últimas |

**Sobre bloquear por cuenta:** es lo correcto contra fuerza bruta dirigida, pero permite que alguien que conozca el correo bloquee una cuenta a propósito. Se compensa con tres cosas que **no** bloquean: rate limit por IP, correo de alerta al usuario (§16, correo 13) y desbloqueo inmediato del admin.

### 10.3 Flujos

**1 · Alta (sólo admin).** Genera temporal de 16 caracteres sin ambigüedades, hash argon2id, `mustChangePassword = true`, `tempPasswordExpiresAt = +72 h`, estado `PENDING_ACTIVATION`. Emite `UserCreated` → correo 1 (o correo 2 si ya tiene pagaré asignado). Responde `201` con la temporal en claro, una sola vez.

**2 · Primer acceso.** `login` con la temporal devuelve `challenge: "must_change_password"` y un `changeToken` de 10 min con un único permiso. `password/change-initial` deja la cuenta `ACTIVE` y emite el par de tokens. **Sin OTP**: ya demostró posesión de la temporal. Temporal caducada → `410 Gone` y el admin la re-genera.

**3 · Cambio estando dentro (con OTP).** `change/request` valida la cuota **antes** de enviar nada y manda el código; `change/confirm` verifica OTP + contraseña actual + historial + política, y **revoca todas las sesiones salvo la actual**.

**4 · Olvido (con OTP).** `password/forgot` responde **siempre 202**, exista o no la cuenta. `password/reset` cambia y revoca **todas** las sesiones.

**5 · Reset del admin.** Nueva temporal de 72 h visible una vez, correo 5, revocación total de sesiones, cuota a cero, registro en `audit`.

**6 · Desbloqueo del admin.** Limpia `failedLoginCount` y `lockedUntil`.

### 10.4 Tokens

| Token | Vida | Dónde vive | Claims relevantes |
|---|---|---|---|
| **Access** | 15 min | Memoria en iOS; cookie `httpOnly` en web | `sub`, `role`, `pwdVersion`, `sessionId`, `jti` |
| **Refresh** | 30 días | Llavero iOS (`AfterFirstUnlockThisDeviceOnly`); cookie `httpOnly` en web | Hash en DB, `familyId`, `deviceId` |
| **changeToken** | 10 min | Memoria | Un único permiso |
| **resetToken** | 10 min | Memoria | Un solo uso, derivado del OTP |

- **`pwdVersion`** se incrementa en cada cambio o reset; el guard lo compara contra la DB y el access token muere al instante, sin esperar sus 15 min.
- **Rotación con detección de reutilización:** cada refresh invalida el anterior en la misma familia. Un refresh ya consumido se interpreta como robo: se revoca la familia completa y sale el correo 13.
- **Revocación en cascada:** cambio, reset, bloqueo, suspensión o baja revocan todas las familias. El cambio autenticado conserva sólo la sesión desde la que se hizo.
- **Bloqueo activo:** `login` y `refresh` devuelven `423` con `retryAfter`, y un access token emitido antes del bloqueo también se rechaza, porque el guard consulta el estado del usuario y no sólo la firma.
- **Anti-carrera en iOS:** el refresco vive en un `actor` que comparte la tarea en curso; tres `401` simultáneos esperan el mismo refresco.
- **Tiempo constante:** la verificación argon2id se ejecuta también con correo inexistente.

---

## 11. Estados del pagaré

### 11.1 Los dos ejes

Son preguntas distintas y hacen falta las dos. Confundirlas deforma los indicadores.

| Eje | Pregunta | Valores | Quién lo fija |
|---|---|---|---|
| **`status`** | ¿Qué es este documento hoy? | `PENDING_SIGNATURE · PROCESSING_SIGNATURE · ISSUED · PARTIALLY_PAID · OVERDUE · PAID · RESTRUCTURED · RENEWED · WRITTEN_OFF · VOID` | Saldo, reloj o acción explícita del admin |
| **`portfolioClass`** | ¿Cómo cuenta este saldo? | `VIGENTE` · `VENCIDA` | Derivado: **90 días naturales** sin pago |

Y dos campos derivados más, para no mezclar vocabularios:

- **`agingBucket`** — tramo de antigüedad: `CURRENT · D1_30 · D31_60 · D61_90 · D91_120 · D120_PLUS`.
- **`collectionStage`** — etapa de gestión: `PREVENTIVA · ADMINISTRATIVA · EXTRAJUDICIAL · JUDICIAL · CASTIGO` (§13.2).

**Un pagaré con 10 días de atraso está `OVERDUE` pero su saldo sigue en cartera `VIGENTE`.** Vencido y cartera vencida no son lo mismo.

`inLitigation` es una **bandera**, no un estado: convive con `OVERDUE`, `RESTRUCTURED` y `WRITTEN_OFF`.

### 11.2 Cómo se deriva el `status`

Primero mandan las marcas explícitas, en este orden: `voidedAt` → `VOID`; `writtenOffAt` → `WRITTEN_OFF`; `renewedById` → `RENEWED`; convenio activo → `RESTRUCTURED`; sin firma → `PENDING_SIGNATURE`; firma en proceso → `PROCESSING_SIGNATURE`.

Si no hay ninguna, manda el saldo y el reloj:

Se evalúan **en este orden** y gana la primera que se cumple:

| # | Condición | `status` |
|---|---|---|
| 1 | Anulado, castigado o renovado | `VOID` · `WRITTEN_OFF` · `RENEWED` |
| 2 | Sin firma | `PENDING_SIGNATURE` · `PROCESSING_SIGNATURE` |
| 3 | `balance == 0` | `PAID` |
| 4 | Convenio activo | `RESTRUCTURED` |
| 5 | `balance > 0` y `dueDate < hoy` (en `America/Mexico_City`) | `OVERDUE` |
| 6 | `0 < paid < amount` | `PARTIALLY_PAID` |
| 7 | Sin abonos | `ISSUED` |

`OVERDUE` gana sobre `PARTIALLY_PAID`: un pagaré con abonos pero vencido sigue siendo un vencido, que es lo que hay que ver primero.

**`RESTRUCTURED` gana sobre `OVERDUE`.** Un pagaré en convenio con la fecha original pasada **no** es un vencido: ya tiene un acuerdo. Por eso no aparece en la pestaña *Vencidos* ni en el indicador *Vencidos* del panel. Sí entra en *cartera vencida* a los 90 días, donde lo que se mide es el riesgo y no el estado.

**`OVERDUE` no se guarda: se calcula.** No hay proceso nocturno que mueva la columna `status` al dar la medianoche (§18), así que ninguna consulta puede filtrar por `status = OVERDUE`. En SQL, vencido es `status ∈ {ISSUED, PARTIALLY_PAID}` y `dueDate < hoy`; en memoria lo resuelve `deriveState`. Las dos formas viven en un solo lugar cada una y dicen lo mismo.

### 11.3 Matriz de transiciones

Vive en `note-status.ts`. Lo que no está aquí devuelve `409 invalid_status_transition`.

| Desde ↓ | Hacia | Disparador |
|---|---|---|
| `PENDING_SIGNATURE` | `PROCESSING_SIGNATURE` · `VOID` | Firma recibida · anulación |
| `PROCESSING_SIGNATURE` | `ISSUED` · `PENDING_SIGNATURE` | `SignatureProcessed` · fallo del pipeline (vuelve y avisa) |
| `ISSUED` | `PARTIALLY_PAID` · `OVERDUE` · `PAID` · `RESTRUCTURED` · `RENEWED` · `WRITTEN_OFF` · `VOID` | Abono · el reloj al consultar · abono total · convenio · renovación · castigo · anulación |
| `PARTIALLY_PAID` | `OVERDUE` · `PAID` · `RESTRUCTURED` · `RENEWED` · `WRITTEN_OFF` · `VOID` | Igual que arriba |
| `OVERDUE` | `PAID` · `RESTRUCTURED` · `RENEWED` · `WRITTEN_OFF` · `VOID` | Igual que arriba |
| `RESTRUCTURED` | `PAID` · `OVERDUE` · `WRITTEN_OFF` · `VOID` | Convenio cumplido · convenio roto · castigo · anulación |
| `WRITTEN_OFF` | `OVERDUE` | Sólo por **reversión explícita** del castigo, con motivo |
| `PAID` · `RENEWED` · `VOID` | — | Finales |

Reglas que la tabla no muestra:

- Sólo son **manuales** `VOID`, `WRITTEN_OFF`, su reversión, el convenio y la renovación. El resto lo deriva §11.2.
- `VOID` y `WRITTEN_OFF` exigen **motivo de catálogo cerrado** más nota libre, e `Idempotency-Key`. Son las dos acciones con impacto económico irreversible.
- Un abono sobre `WRITTEN_OFF` se registra como **recuperación de cartera castigada**: no cambia el estado ni devuelve el saldo a la cartera activa.
- Un pagaré firmado **no se edita nunca**. Se prorroga, se renueva, se convenia, se castiga o se anula.

---

## 12. Dinero, abonos e interés

### 12.0 Una mensualidad, un pagaré

Un pagaré es un título de **pago único**: la ley no admite un calendario dentro. Documentar doce mensualidades es emitir **doce pagarés** firmados el mismo día, numerados «3 de 12» y con vencimientos mes a mes (ADR 0015). Se pide con `installments` al emitir; el servidor reparte el importe —el sobrante va en la primera cuota— y manda **un solo aviso** por toda la serie.

Los abonos libres siguen siendo compatibles: cada pagaré de la serie admite pagos parciales.

**El interés del plan es el ordinario**, el precio del préstamo, y no el moratorio de §12.3. Se pacta al emitir y se reparte dentro de las cuotas, de dos formas (ADR 0016): sobre **saldos insolutos** —cada mes sobre lo que queda, sistema francés de cuota fija— o sobre **saldo global** —siempre sobre el importe original—. Con la misma tasa, Banxico documenta que el global casi duplica el costo, así que la pantalla lo avisa antes de emitir. El desglose de cada cuota se guarda con el pagaré: es lo pactado, no algo que se recalcule después.

**Liquidar antes de tiempo** (ADR 0017) se consulta con `GET /admin/notes/:id/early-payoff`, y contesta por la serie entera aunque se pregunte desde una cuota. Sobre saldos insolutos el interés de las cuotas futuras no se cobra —el tiempo que no transcurre no se causa—; sobre saldo global sí, porque se pactó de una vez sobre el importe original. La cuota ya vencida se debe entera, lo abonado se imputa primero a intereses (art. 2094 CCF) y el moratorio se suma aparte y no se perdona. Es una consulta: no cobra, no cambia estados y otro día da otro número.

### 12.1 Reglas transversales del dinero

- **Enteros de centavos** (`BigInt`) en base, `Money` VO en dominio, `Int64` en el contrato. Formateo sólo en el presenter. **Nunca `Float`.**
- **Fechas civiles** (`issueDate`, `dueDate`, `paidOn`) como `@db.Date` sin zona; **instantes** (`createdAt`, `capturedAt`, `expiresAt`) en UTC.
- **Zona de negocio `America/Mexico_City`** (Morelia, zona Centro; México suprimió el horario de verano en 2022, pero se guarda la zona IANA, no el offset). Regla única en `domain-rules/business-calendar.ts`, `Clock` inyectable, corte diario a las **00:05 locales**. Nada de `new Date()` suelto.
- **Sin planes de pago:** abonos libres. Ni cuotas, ni amortización, ni suscripción, ni pasarela.

### 12.2 Abonos

**Invariantes** (`Payment.register()`):
- `amountCents > 0` y **≤ saldo restante**; `payment_exceeds_balance` devuelve el saldo real.
- `paidOn` no futura y no anterior a `issueDate`.
- No se admite abono sobre `VOID`, `PAID` ni `RENEWED`. Sobre `WRITTEN_OFF` sí, como recuperación (§11.3).
- Un abono **nunca se borra ni se modifica**. Anular es **asentar un movimiento de reversa**: una fila nueva con importe negativo, `reversalOfId` apuntando al original, motivo y actor. El original queda intacto y el libro es **sólo de anexar**, que es como se lleva cualquier registro de dinero: el error y su corrección conviven como hechos ordenados. Reversar una reversa no se permite.

**Concurrencia.** Dos admins abonando a la vez podrían sobrepagar si ambos leen el saldo antes de que el otro escriba. El caso de uso toma **bloqueo de fila** sobre el pagaré (`lockForUpdate`), inserta el abono, recalcula y actualiza `paidCents` y `status` **en la misma transacción**. Con `Idempotency-Key` obligatoria, un reintento por red cortada no duplica nada.

**Saldo denormalizado con reconciliación.** La verdad es `SUM(Payment.amountCents)` sobre las filas vigentes y sus reversas. Como sumar los abonos de cada fila al listar 40 pagarés es inviable, `paidCents` se mantiene como **vista materializada** en el pagaré, actualizada en la misma transacción que el abono. `verify-balances` (§18) reconcilia semanalmente y **alerta** si hay deriva; nunca corrige en silencio. Es el patrón estándar de los libros contables: asientos inmutables como fuente, saldo cacheado para leer rápido, reconciliación periódica.

### 12.3 Interés moratorio (art. 174 LGTOC)

**La tasa se pacta por mes o por año, y el documento dice cuál.** En México lo
habitual en pagarés entre particulares es mensual —"3% mensual"—, aunque la
anual también se usa. Se guardan las dos cosas: `interestPeriod` para que el
papel diga lo que se firmó, y `interestRateAnnualPct` para calcular. La
conversión es simple, sin capitalizar: mensual × 12. Componerla inflaría la
deuda respecto de lo que dice el documento.

Sin tasa pactada aplica la legal, **6 % anual** (art. 362 Cód. Comercio, vía
art. 174 LGTOC). Y por encima del umbral de §25.14 el sistema **avisa**: la
SCJN permite al juez reducir de oficio un interés notoriamente usurario, así
que pactar una tasa desmedida es un riesgo del acreedor, no una ventaja.


Interés **simple, no capitalizable**, por día natural desde el día siguiente a `dueDate` hasta la fecha de corte.

```
interés = saldo × (tasaAnual / base) × díasDeAtraso        base = 360 | 365, en settings
```

- La tasa es **anual** y explícita en el contrato (`interestRateAnnualPct`). `null` = sin intereses pactados; `0` = pactados en cero. No es lo mismo.
- Se calcula **sobre el saldo**, así que baja con los abonos.
- **Snapshot al abonar:** cada `Payment` guarda `interestAccruedCents`. El histórico no se recalcula aunque cambie la tasa por defecto.
- **Aplicación del abono:** primero interés devengado, luego capital (invertible en `settings`). El recibo desglosa ambas partes.
- Función pura en `interest/domain/accrue-interest.ts`, con tests de borde: día del vencimiento (0 días), año bisiesto, saldo cero, cambio de tasa.

### 12.4 Idempotencia, con todas sus reglas

Guardar la clave no basta; hay cuatro detalles que separan una idempotencia real de una decorativa:

1. **La fila de la clave se inserta en la misma transacción que la operación.** Si se escriben por separado, dos peticiones simultáneas se cuelan entre medias y el abono se duplica.
2. **La clave se acota al endpoint y al actor.** La misma clave en `POST /payments` y en `POST /notes` son independientes; no colisionan.
3. **Misma clave con cuerpo distinto = `422`.** Se guarda el `requestHash`: si alguien reintenta "la misma operación" con otro importe, es un error del cliente, no un reintento. Devolver la respuesta vieja sería peor que fallar.
4. **Los errores 5xx no se cachean.** Una caída del servidor no puede dejar al cliente clavado en un error permanente: esa clave debe poder reintentarse.

Además, una petición con una clave **en vuelo** recibe `409 idempotency_conflict` en lugar de ejecutarse en paralelo. TTL de 24 h, purgado por `purge-expired` (§18).

---

## 13. Cartera, cobranza, convenios y legal

### 13.1 Motor de recordatorios

Reglas **en tabla editable desde el dashboard**, nunca en código:

| Campo | Ejemplo |
|---|---|
| `offsetDays` | `-7 · -3 · -1 · 0 · +1 · +7 · +15 · +30` (negativo = antes del vencimiento) |
| `channel` | `EMAIL` y `PUSH` implementados (§24.3). `WHATSAPP` es **enlace `wa.me` manual** desde el dashboard, no envío automático (§24.2). `SMS` queda en el enum sin adaptador |
| `templateId` | Plantilla por tramo: un aviso de 3 días no se escribe como uno de 90 |
| `condition` | `balance > 0`, opcionalmente por monto o por deudor |
| `active` | Se apaga sin borrar el historial |

`GET /admin/reminders/today` evalúa las reglas contra la cartera y dice a quién le toca aviso hoy; `POST` los manda. No hay job ni reloj: lo dispara el administrador desde su bandeja (§18). Es **idempotente por `(noteId, ruleId, fecha)`**, así que pulsarlo dos veces el mismo día no manda dos correos. Un expediente judicial abierto **congela** los recordatorios de ese pagaré.

### 13.2 Etapas de gestión

| Etapa | Cuándo | Qué se hace |
|---|---|---|
| **Preventiva** | −7 a 0 días | Recordatorio amable, automático |
| **Administrativa** | 1–30 días | Correo automático y llamada con bitácora |
| **Extrajudicial** | 31–89 días | Presión formal, convenio, quita |
| **Judicial** | 90+ días | Demanda mercantil; **requiere el pagaré original en papel** |
| **Castigo** | Incobrable | Sale de la cartera activa sin dejar de deberse |

`collectionStage` se **sugiere** por días de atraso, pero el admin puede adelantarla o **congelarla**: un deudor que responde no debe escalar a judicial por calendario.

### 13.3 Bitácora y promesas de pago

Cada contacto se registra con tipo (`CALL`, `WHATSAPP`, `EMAIL`, `VISIT`, `OTHER`) y resultado (`NO_ANSWER`, `PROMISED`, `REFUSED`, `PAID`, `DISPUTED`). Si hay **promesa de pago**, lleva fecha comprometida: el día anterior sale el correo 21, y si se incumple el pagaré vuelve solo a la bandeja de Hoy y sube de tramo.

### 13.4 Convenios y quitas

Cuando el deudor no puede pagar todo, se negocia — y sin esto se negocia por WhatsApp y se olvida.

- Se registra monto convenido, **quita otorgada** y vigencia.
- Cumplido → el pagaré pasa a `PAID` y la quita queda como **pérdida explícita** en el reporte.
- Incumplido en su fecha → `check-broken-settlements` lo marca `BROKEN`, el pagaré **vuelve a `OVERDUE` con su saldo original** y sale el correo 20. Nadie tiene que acordarse.

### 13.5 Prórroga y renovación

- **Prórroga:** `NoteExtension` con fecha anterior, nueva, motivo y actor. El pagaré **conserva su firma**, porque es el mismo documento.
- **Renovación:** pagaré nuevo con `renewedFromId`; el anterior pasa a `RENEWED`. **Requiere firma nueva**, porque es un documento nuevo.

### 13.6 Expediente legal y documento físico

Para demandar hace falta el pagaré **original en papel**, que queda en custodia del juzgado. El sistema registra `physicalDocumentLocation` con responsable y bitácora de custodia, más el expediente: abogado, juzgado, número, actuaciones fechadas y escaneos con el perfil `legal-exhibit` (§8.3).

### 13.7 Los seis finales

| Final | ¿Sigue debiendo? | Efecto |
|---|---|---|
| `PAID` | No | Carta de finiquito automática (§17) |
| `VOID` | No | Motivo obligatorio; no computa en ningún indicador |
| `RENEWED` | Sí, en el pagaré nuevo | Cierra el anterior |
| `RESTRUCTURED` | Sí, en condiciones nuevas | Registra la quita |
| `WRITTEN_OFF` | **Sí — sigue exigible** | Sale de cartera activa; entra al reporte de castigos |
| En juicio | Sí | Bandera, no estado (§11.1) |

**Castigar no es perdonar.** El castigo es contable; la deuda sigue viva y un abono posterior es *recuperación de cartera castigada*, renglón propio del reporte.

---

## 14. Modelo de datos

### 14.1 Entidades por módulo dueño

**26 entidades.** `Debtor` y `User` son distintos (§25.2). Ningún módulo escribe en tablas de otro; las lecturas cruzadas pasan por `reports`.

| Módulo | Entidades |
|---|---|
| `promissory-notes` | `PromissoryNote`, `NoteExtension`, `Guarantor` |
| `debtors` | `Debtor` (enlace opcional a `User`, §25.2) |
| `signatures` | `Signature`, `GuarantorSignature` |
| `media` | `MediaAsset` |
| `payments` | `Payment` (libro sólo de anexar, con reversas) |
| `settlements` | `Settlement` |
| `collections` | `ReminderRule`, `ReminderLog`, `CollectionActivity` |
| `legal` | `LegalCase`, `LegalAction` |
| `users` · `credentials` · `otp` · `auth` | `User` (con `role`, §25.1), `Identity`, `PasswordChangeLog`, `PasswordHistory`, `OtpChallenge`, `RefreshToken` |
| `numbering` | `DocumentSequence` |
| `settings` | `OrganizationSettings` |
| `audit` | `AuditLog` (encadenado), `IdempotencyKey` |
| `notifications` | `OutboxMessage` (avisos pendientes) |
| `notifications` | `DeviceToken` |

### 14.2 Esquema (fragmentos que fijan las decisiones)

```prisma
model PromissoryNote {
  id            String   @id @default(uuid())
  folio         String   @unique              // §12: lo genera numbering, nunca el cliente
  publicToken   String   @unique              // 128 bits, consulta sin login
  status        NoteStatus                    // derivado §11.2
  portfolioClass PortfolioClass               // VIGENTE | VENCIDA — 90 días
  agingBucket   AgingBucket
  collectionStage CollectionStage
  stageFrozen   Boolean  @default(false)      // el admin congela el escalamiento
  daysOverdue   Int      @default(0)

  issuePlace    String
  issueDate     DateTime @db.Date
  paymentPlace  String
  dueDate       DateTime @db.Date
  creditorName  String
  debtorId      String
  ownerId       String?                       // cuenta que puede verlo y firmarlo; null si el deudor no tiene correo (§25.2)
  signatureMode SignatureMode?                // REMOTE | IN_PERSON (§25.3)
  prescribesOn  DateTime? @db.Date            // dueDate + plazo de settings (§25.13)
  requiresGuarantors Int    @default(0)        // 0, 1 o 2 (§25.15)
  amountCents   BigInt
  paidCents     BigInt   @default(0)          // denormalizado, misma transacción
  currency      String   @db.Char(3)
  amountInWords String                        // derivado en servidor
  interestRateAnnualPct Decimal? @db.Decimal(5,2)  // null ≠ 0
  observations  String?
  acceptedAt    DateTime?

  inLitigation  Boolean  @default(false)
  physicalDocumentLocation String?
  renewedFromId String?
  renewedById   String?  @unique
  voidedAt      DateTime?  ; voidReason      String? ; voidedBy      String?
  writtenOffAt  DateTime?  ; writeOffReason  String? ; writtenOffBy  String?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([status, dueDate])
  @@index([portfolioClass, agingBucket])
  @@index([ownerId, createdAt])
  @@index([debtorId, status])
}

model Payment {
  id                   String   @id @default(uuid())
  noteId               String
  amountCents          BigInt
  interestAccruedCents BigInt   @default(0)   // snapshot §12.3
  appliedToInterestCents BigInt @default(0)
  appliedToPrincipalCents BigInt @default(0)
  isRecovery           Boolean  @default(false) // abono sobre castigado
  paidOn               DateTime @db.Date
  method               PaymentMethod
  reference            String?
  memo                 String?
  registeredBy         String
  reversalOfId         String?  @unique         // asiento de reversa; el original nunca se toca
  reversalReason       String?
  createdAt            DateTime @default(now())
  @@index([noteId, paidOn])
}

model Settlement {
  id            String   @id @default(uuid())
  noteId        String
  agreedCents   BigInt
  forgivenCents BigInt   @default(0)          // quita
  dueOn         DateTime @db.Date
  terms         String?
  status        SettlementStatus              // ACTIVE | FULFILLED | BROKEN
  authorizedBy  String
  createdAt     DateTime @default(now())
  @@index([noteId, status])
}

model Signature {
  id           String   @id @default(uuid())
  noteId       String   @unique
  assetId      String                          // MediaAsset del WebP
  vectorAssetId String?                        // .pkdrawing
  sha256       String
  width Int ; height Int ; byteSize Int
  capturedAt   DateTime
  strokeCount  Int? ; durationMs Int? ; inputType String?
  deviceModel  String? ; osVersion String? ; appVersion String?
  ipAddress    String?
}

model DocumentSequence {                        // §12: folio transaccional
  type      SequenceType                        // NOTE | RECEIPT | STATEMENT
  year      Int
  lastValue Int      @default(0)
  @@id([type, year])
}

model IdempotencyKey {
  key          String   @id
  endpoint     String                            // la clave sólo colisiona dentro del mismo endpoint
  actorId      String
  requestHash  String                            // misma clave + cuerpo distinto = 422
  status       IdemStatus                        // IN_FLIGHT | COMPLETED
  responseCode Int?
  responseBody Json?                             // se devuelve tal cual en el reintento
  expiresAt    DateTime                          // TTL 24 h
  createdAt    DateTime @default(now())
  @@index([expiresAt])
}

model OutboxMessage {                            // §3.3 — se escribe en la misma transacción que el cambio
  id          String   @id @default(uuid())
  eventType   String
  payload     Json
  publishedAt DateTime?
  attempts    Int      @default(0)
  createdAt   DateTime @default(now())
  @@index([publishedAt, createdAt])
}

model ProcessedEvent {                           // inbox: hace idempotente a cada handler
  eventId String
  handler String
  createdAt DateTime @default(now())
  @@id([eventId, handler])
}

enum NoteStatus      { PENDING_SIGNATURE PROCESSING_SIGNATURE ISSUED PARTIALLY_PAID OVERDUE PAID RESTRUCTURED RENEWED WRITTEN_OFF VOID }
enum PortfolioClass  { VIGENTE VENCIDA }
enum AgingBucket     { CURRENT D1_30 D31_60 D61_90 D91_120 D120_PLUS }
enum CollectionStage { PREVENTIVA ADMINISTRATIVA EXTRAJUDICIAL JUDICIAL CASTIGO }
enum PaymentMethod   { CASH TRANSFER CHECK OTHER }
enum SettlementStatus{ ACTIVE FULFILLED BROKEN }
enum Channel         { EMAIL WHATSAPP SMS PUSH }
enum SequenceType    { NOTE RECEIPT STATEMENT }
enum IdemStatus      { IN_FLIGHT COMPLETED }
enum UserRole        { ADMIN CLIENT }
enum SignatureMode   { REMOTE IN_PERSON }
```

Las entidades de identidad (`User`, `OtpChallenge`, `RefreshToken`, `PasswordChangeLog`, `PasswordHistory`, `AuditLog`) siguen la política de §10 y se detallan en el mismo esquema.

### 14.3 Campos derivados y su verificación

`status`, `portfolioClass`, `agingBucket`, `collectionStage`, `daysOverdue` y `paidCents` se persisten denormalizados **y se recalculan en la misma transacción que los provoca** o en el job diario de §18. Nunca existe un cron que "arregle" datos a posteriori: `verify-balances` **detecta y alerta**, no corrige en silencio.

### 14.4 Catálogo de códigos de error

Declarados una vez en `packages/contracts/errors.ts` y consumidos por API, web e iOS. Lista cerrada; añadir un error es añadir una entrada aquí. Todos viajan en formato **RFC 9457** (`application/problem+json`) con `traceId`.

| Familia | Códigos |
|---|---|
| Pagaré | `due_date_before_issue_date` · `amount_not_positive` · `amount_too_large` · `issue_date_in_future` · `interest_rate_out_of_range` · `place_required` · `note_not_editable` |
| Firma | `signature_empty` · `signature_too_large` · `unsupported_format` · `signature_required` · `signature_processing_failed` |
| Abonos | `payment_exceeds_balance` · `payment_date_invalid` · `note_not_payable` · `payment_already_voided` |
| Estado | `invalid_status_transition` · `note_already_final` · `reason_required` |
| Convenios | `settlement_already_active` · `settlement_expired` · `forgiveness_exceeds_balance` |
| Folio | `duplicate_folio` · `sequence_locked` |
| Autenticación | `invalid_credentials` · `account_locked` · `must_change_password` · `temp_password_expired` · `refresh_reused` · `token_expired` |
| Contraseña y OTP | `password_too_weak` · `password_reused` · `password_change_limit_reached` · `otp_invalid` · `otp_expired` · `otp_attempts_exceeded` · `otp_cooldown` |
| Genéricos | `not_found` · `forbidden` · `conflict` · `rate_limited` · `idempotency_conflict` · `service_unavailable` |

---

## 15. Endpoints — tabla única

Todos bajo `/api/v1`. `A` = JWT admin · `C` = JWT cliente · `P` = pública · **Idem** = exige `Idempotency-Key`.

| Método y ruta | Rol | Qué hace |
|---|---|---|
| `POST /auth/login` | P | Tokens, o `challenge`, o `423` si bloqueado |
| `POST /auth/refresh` · `/logout` | C·A | Rotación con detección de reutilización · cierre de familia |
| `POST /auth/password/change-initial` | changeToken | Cambio obligatorio del primer acceso, sin OTP |
| `POST /auth/password/change/request` · `/confirm` | C | Cambio con OTP y cuota de 3/semana |
| `POST /auth/password/forgot` · `/reset` | P | Recuperación con OTP; `forgot` siempre 202 |
| `GET /me/summary` | C | Cuánto debe en total, número de pagarés y próximo vencimiento |
| `GET /me/notes` · `/notes/:id` | C | Sus pagarés con saldo y atraso · detalle con interés devengado |
| `GET /me/notes/:id/payments` | C | Historial de abonos de **su** pagaré, con desglose interés/capital |
| `GET /me/notes/:id/documents/:type` | C | Descarga su pagaré (`note`) o un recibo (`receipt`) |
| `GET /me/activity` | C | Avisos: recordatorios, abonos registrados, liquidaciones |
| `POST /me/notes/:id/signature` | C · **Idem** | Sube PNG + vector; responde `202` (§8.2) |
| `POST /uploads/presign` | C·A | URL de subida directa para archivos grandes (§8.5) |
| `GET /public/notes/:publicToken` | P | Consulta de solo lectura, sin PII |
| `GET /health` | P | Liveness y readiness |
| `GET /admin/reminders/today` · `POST` | A | A quién le toca aviso hoy · los manda todos, sin duplicar (§13.1) |
| `GET /admin/notifications` | A | Avisos que no salieron: atascados y en cola, con su motivo (§18.1) |
| `POST /admin/notifications/retry` · `/:id/retry` | A | Reintenta los atascados, o uno. `409` si ya se entregó |
| `POST /admin/notes` | A · **Idem** | Emite el pagaré, asigna folio, crea la cuenta si hace falta y manda a firmar |
| `GET /admin/notes` · `/notes/:id` | A | Listado con cursor, filtros y pestañas de §19.4 · detalle |
| `POST /admin/notes/:id/extensions` | A | Prórroga con motivo |
| `POST /admin/notes/:id/renew` | A · **Idem** | Emite el sustituto y cierra el anterior |
| `POST /admin/notes/:id/void` | A · **Idem** | Anula con motivo de catálogo |
| `POST /admin/notes/:id/write-off` · `/reinstate` | A · **Idem** | Castigo con motivo · reversión con motivo |
| `POST /admin/notes/:id/payments` | A · **Idem** | Registra abono; devuelve saldo y estado nuevos |
| `GET /admin/notes/:id/payments` | A | Historial, incluidos los anulados con su motivo |
| `POST /admin/payments/:id/void` | A | Anula un abono con motivo y recalcula |
| `POST /admin/notes/:id/settlements` | A · **Idem** | Convenio con quita |
| `PATCH /admin/settlements/:id` | A | Marca cumplido o roto manualmente |
| `POST /admin/notes/:id/activities` · `GET` | A | Bitácora de gestión y promesas |
| `POST /admin/notes/:id/legal-case` | A | Abre expediente |
| `POST /admin/legal-cases/:id/actions` | A | Registra actuación |
| `PATCH /admin/notes/:id/custody` | A | Ubicación del documento físico |
| `GET /admin/debtors` · `/debtors/:id` | A | Cartera y comportamiento de pago |
| `GET /admin/users` · `POST` | A · **Idem** | Listado · alta con temporal de 72 h |
| `POST /admin/users/:id/reset-password` · `/unlock` | A | Reset · desbloqueo |
| `PATCH /admin/users/:id/status` | A | Suspender o reactivar |
| `GET /admin/reports/{aging,portfolio,issued,collected,recovery,written-off,settlements,activity,concentration}` | A | Los nueve reportes de §17.2 |
| `GET /admin/notes/:id/documents/:type` | A | PDF: `note`, `receipt`, `statement`, `release` |
| `GET /admin/debtors/:id/statement` | A | Estado de cuenta del deudor en PDF |
| `POST /admin/notes/:id/send-email` | A | Reenvío manual de un documento |
| `GET /admin/reminder-rules` · `PUT` | A | Reglas de recordatorio |
| `GET /admin/settings` · `PUT` | A | Configuración de la organización |
| `GET /admin/notes/:id/simulate` | A | Simulador: capital, interés e importe total a una fecha dada (§24.5) |
| `GET /admin/notes/:id/legal-package` | A | Zip con el expediente completo (§24.5) |
| `POST /admin/imports/debtors` · `/notes` | A · **Idem** | Importación CSV con validación previa y vista de conflictos |
| `GET /admin/audit` | A | Bitácora, sólo lectura, con verificación de cadena |

**Quién crea pagarés:** sólo el admin (`POST /admin/notes`). iOS **firma, consulta y da seguimiento**; no emite documentos. Es como trabaja quien presta y además reduce la superficie de ataque: el cliente no puede inyectar montos ni fechas.

---

## 16. Correo (Resend)

**Adaptador:** puerto `Mailer` en dominio; `ResendMailer` en producción, `MailpitMailer` en local. Envío **siempre por cola** con reintento exponencial. Se guarda el `messageId` y el webhook de Resend actualiza el estado de entrega, visible en el detalle del pagaré.

**Secreto:** `RESEND_API_KEY` sólo en `.env` (ignorado) y vacío en `.env.example`; `gitleaks` en pre-commit. **La clave compartida en el chat debe rotarse antes de producción.**

**Plantillas:** `packages/emails` con React Email — componentes tipados, preview local, snapshot en CI y texto plano generado. Todas sobre `BaseEmailLayout`. Diseño heredado del producto: papel `#F2F5F2`, acento `#0E6B52`, titulares Spectral, folio e importes en monoespaciada con `tabular-nums`, tablas compatibles con Outlook, 600 px, legible sin imágenes, **un solo CTA**. El elemento central es la **tarjeta-documento** que replica el pagaré.

**Las 21 plantillas.** El número es el identificador estable que usan §3.3, §13 y §18.

| # | Plantilla | Disparo |
|---|---|---|
| 1 | Bienvenida: acceso y contraseña temporal | `UserCreated` sin pagaré |
| 2 | Tienes un pagaré por firmar | `UserCreated` con pagaré · `NoteIssued` |
| 3 | Código para cambiar tu contraseña | `password/change/request` |
| 4 | Restablecer contraseña | `password/forgot` |
| 5 | El administrador restableció tu contraseña | Reset del admin |
| 6 | Pagaré firmado — comprobante (PDF) | `NoteSigned` |
| 7 | Recordatorio de vencimiento | Regla con `offsetDays ≤ 0` |
| 8 | Aviso de atraso | Regla con `offsetDays > 0` |
| 9 | Abono registrado | `PaymentRegistered` |
| 10 | Pagaré liquidado | `NoteSettled` |
| 11 | Pagaré anulado | `NoteVoided` |
| 12 | Resumen semanal del administrador | Cron semanal |
| 13 | Alerta de seguridad | `AccountLocked` · refresh reutilizado |
| 14 | Tu contraseña se cambió correctamente | Cambio o reset completado |
| 15 | Recibo de abono (PDF) | `PaymentRegistered` |
| 16 | Estado de cuenta (PDF) | A demanda y `monthly-statements` |
| 17 | Carta de finiquito (PDF) | `NoteSettled` |
| 18 | Prórroga registrada | `NoteExtended` |
| 19 | Convenio de pago | `SettlementCreated` |
| 20 | Convenio incumplido | `SettlementBroken` |
| 21 | Recordatorio de promesa de pago | Un día antes de `promisedOn` |

El castigo (`NoteWrittenOff`) **no genera correo al deudor**: es un movimiento contable interno. Queda en `audit` y en el reporte.

---

## 17. Documentos y reportes

### 17.1 PDFs — módulo `documents`, motor `@react-pdf/renderer`

Se eligió sobre Puppeteer (2–5 s, 400–600 MB de RAM, +300 MB de imagen Docker y renderizado que cambia con cada versión de Chromium) y sobre PDFKit (posiciona por coordenadas: añadir un bloque obliga a recalcular a mano todo lo que va debajo). `@react-pdf` pesa ~2 MB, tarda <500 ms y usa flexbox.

- **No soporta WebP:** la firma se convierte a PNG en memoria con `sharp` (~5 ms, alfa conservado) antes de incrustarla.
- **Sin duplicar el diseño:** el documento del dashboard y el del PDF comparten el presenter `NoteDocumentModel` y los tokens tipográficos; sólo cambia la capa de pintado.
- **Salida de emergencia:** `PdfRenderer` es un puerto; si el diseño supera lo que `@react-pdf` permite, se añade un adaptador Puppeteer sin tocar ningún caso de uso.

| Documento | Folio | Se genera | Se entrega |
|---|---|---|---|
| **Pagaré** | `PAG-…` | Al quedar `ISSUED` | Correo 6 · descarga · vista pública |
| **Recibo de abono** | `REC-…` | `PaymentRegistered` | Correo 15 · descarga |
| **Estado de cuenta** | `EDC-…` | A demanda y mensual | Correo 16 · descarga |
| **Carta de finiquito** | — | `NoteSettled` | Correo 17 · descarga |
| **Certificado de evidencia de firma** | — | Junto al pagaré, al quedar `ISSUED` | Descarga · paquete legal (§24.1) |
| **Paquete legal** (zip) | — | A demanda | Pagaré + certificado + estado de cuenta + bitácora + escaneos (§24.5) |

### 17.2 Los nueve reportes — módulo `reports`

Sólo lectura. Todos con rango de fechas, vista en pantalla y exportación CSV/XLSX.

| # | Reporte | Responde |
|---|---|---|
| 1 | **Cartera vigente vs. vencida** | El número con el que se toman decisiones |
| 2 | **Antigüedad de saldos** (`CURRENT`, `D1_30`, `D31_60`, `D61_90`, `D91_120`, `D120_PLUS`) | Dónde está el riesgo |
| 3 | **Colocado por periodo** | Cuánto se emitió |
| 4 | **Liquidado por periodo** | Cuánto se recuperó y en cuánto tiempo |
| 5 | **Recuperación mensual** | Cobrado, separando capital, interés y recuperación de castigos |
| 6 | **Cartera castigada y recuperada** | Renglón obligado en cualquier revisión |
| 7 | **Convenios** vigentes, cumplidos e incumplidos | Si negociar funciona |
| 8 | **Gestión por periodo** | Contactos, promesas hechas y cumplidas |
| 9 | **Concentración por deudor** | Cuánto del riesgo está en pocas manos |

Además: **descarga masiva de PDFs en zip** y **exportación contable** de cartera y abonos.

---

## 18. Trabajo en segundo plano: no hay

**Decisión revisada.** El worker separado, la cola BullMQ y Redis se eliminaron del proyecto. Motivo: en un VPS con pocos pagarés al día no compensan su memoria ni su complejidad, y el sistema no debe disparar nada por su cuenta.

Cómo se resuelve cada cosa ahora:

| Antes (worker) | Ahora |
|---|---|
| Comprimir la firma en cola | En la misma petición. El cliente espera ~400 ms más |
| Generar el PDF en cola | Al momento de descargarlo o adjuntarlo |
| Enviar correo en cola | Tras confirmar la transacción, en el mismo proceso (§18.1) |
| Job diario de vencidos | **No hace falta**: un pagaré está vencido si `dueDate < hoy`, y eso se calcula al consultar |
| Job de aging y clasificación | Igual: se derivan al leer, con las funciones puras de `domain-rules` |
| Recordatorios automáticos | Botón **Enviar recordatorio** en el dashboard, cuando el administrador decida |

### 18.1 Envío de avisos, sin cola

La operación guarda el aviso en `OutboxMessage` **dentro de la misma transacción** que el cambio. En cuanto ésta confirma, el propio proceso intenta enviarlo. Si el envío falla, la fila queda pendiente con su error, el dashboard lo muestra y permite reenviar.

Eso conserva lo único que importaba del outbox —que un abono no se quede sin recibo y nadie se entere— sin cola, sin Redis y sin proceso aparte. Si algún día el volumen lo pide, mover ese despacho a una cola es cambiar el adaptador: el resto del código no se toca.

---

## 19. Dashboard

La prueba de que está bien hecho: **el admin abre el sistema por la mañana y no tiene que decidir por dónde empezar ni abrir Excel.** Cada elemento de aquí existe para eliminar una tarea manual concreta.

### 19.1 Navegación

El menú los presenta en tres grupos —**Operación** (Panel, Pagarés, Cobranza),
**Análisis** (Cartera, Reportes) y **Directorio** (Deudores, Accesos, Ajustes)—
porque sin esa separación *Cobranza* y *Reportes* parecen lo mismo, y *Deudores*
y *Accesos* también: los primeros deben dinero, los segundos entran al sistema.

| Ruta | Nombre | Para qué |
|---|---|---|
| `/` | **Panel** | Bandeja de trabajo |
| `/pagares` | **Pagarés** | La cartera completa, con las pestañas de §19.4 |
| `/pagares/nuevo` | — | Emitir y mandar a firmar |
| `/pagares/[id]` | — | Detalle y operación |
| `/cartera` | **Cartera** | Aging, clasificación e indicadores |
| `/cobranza` | **Cobranza** | Embudo por etapa, convenios y promesas |
| `/reportes` | **Reportes** | Los nueve de §17.2 y las exportaciones |
| `/clientes` | **Deudores** | Quién debe, cuánto y cómo paga |
| `/usuarios` | **Accesos** | Cuentas que entran a la aplicación |
| `/ajustes` | **Ajustes** | Organización, valores por defecto, reglas |
| `/p/[token]` | *(pública)* | Consulta de solo lectura, sin login |

Ocho destinos en la barra lateral, con contador de pendientes en **Hoy**.

### 19.2 `/` — Hoy

**Es una bandeja de trabajo, no un panel de gráficas.** Cuatro colas, cada una con su contador y su acción directa; vacía se dice con esas palabras.

| Cola | Qué agrupa | Acción en la fila |
|---|---|---|
| **Vencen hoy** | `dueDate = hoy` con saldo | Registrar abono · Llamar · Recordar |
| **Promesas incumplidas** | `promisedOn < hoy` sin abono posterior | Registrar gestión · Reprogramar |
| **Con atraso sin gestión** | Con atraso y sin actividad en 7 días. Incluye los que están en convenio: el atraso se atiende aunque el estado no sea *Vencido* | Registrar gestión · Escalar etapa |
| **Firmas pendientes** | Enviados y sin firmar en 48 h | Reenviar acceso · Recordar |
| **Sin canal automático** | Deudores sin correo con recordatorio pendiente | Abrir WhatsApp · Llamar |
| **Por prescribir** | A 180, 90 o 30 días del plazo | Escalar a judicial · Registrar gestión |

Encima, cuatro cifras, cada una con su cuenta y su importe: **vigentes**, **vencen en 7 días**, **vencidos** y **pagados este mes**. *Vencidos* usa la misma definición que la pestaña del mismo nombre (§11.2), para que el número del panel y el de la lista no puedan discrepar.

### 19.3 `/pagares` — la tabla es la aplicación

Orden por defecto: **`dueDate` ascendente entre los no liquidados**. La pregunta al abrir es "qué vence primero", no "qué se registró último".

Columnas: franja de estado · folio · deudor · importe · abonado · **saldo** · vencimiento · **días de atraso** · miniatura de firma · acciones.

- Estado con **forma además de color** — franja lateral y chip con texto.
- **Filtros en la URL** (`?tab=vencidos&bucket=D31_60&q=perez`): compartibles y con botón atrás funcional.
- **Búsqueda global** con `⌘K`: folio, nombre, teléfono, importe.
- Paginación **por cursor**; acciones masivas (recordatorio, zip de PDFs, CSV); fila expandible con últimos abonos y última gestión; vistas guardadas.
- Carga con *skeleton*, vacío con acción sugerida, error con reintento. Nunca una tabla en blanco sin explicación.

### 19.4 Pestañas de la cartera

Filtros sobre la misma tabla, con contador y orden propio.

| Pestaña | Criterio | Orden |
|---|---|---|
| Por firmar | `PENDING_SIGNATURE` · `PROCESSING_SIGNATURE` | Antigüedad del envío |
| Vigentes | Saldo > 0, sin atraso | Vencimiento ascendente |
| Por vencer | Vencen en ≤ 7 días | Vencimiento ascendente |
| Vencidos | Con saldo, sin convenio y `dueDate < hoy` (§11.2) | Días de atraso descendente |
| Cartera vencida | `portfolioClass = VENCIDA` (90+) | Monto descendente |
| En convenio | `RESTRUCTURED` con `Settlement` activo | Fecha del convenio |
| En juicio | `inLitigation = true` | Última actuación |
| Pagados | `PAID` | Fecha del último abono, descendente |
| Renovados | `RENEWED` | Fecha de cierre |
| Castigados | `WRITTEN_OFF` | Monto castigado |
| Anulados | `VOID` | Fecha de anulación |

Cada pestaña ajusta sus columnas: en **Pagados** importan la fecha de liquidación y los días que tardó; en **Castigados**, monto y motivo; en **Vencidos**, atraso y última gestión.

### 19.5 `/pagares/[id]` — el detalle parece un pagaré

Izquierda **el documento**: tipografía de papel, importe en número y letra, partes, fechas, y la **firma superpuesta** con su fecha de captura y `sha256` abreviado.

Derecha **la operación**, en pestañas:

| Pestaña | Contenido |
|---|---|
| Resumen | Importe, abonado, **interés devengado al día**, saldo, atraso, tramo, etapa |
| Abonos | Fecha, monto, método, referencia, desglose interés/capital, recibo PDF, anulación con motivo |
| Gestión | Bitácora de contactos y promesas |
| Recordatorios | Qué se envió, cuándo y si llegó |
| Legal | Expediente, actuaciones, ubicación del documento físico |
| Historial | Auditoría legible: quién hizo qué y cuándo |

Acciones: **Registrar abono** (principal), Recordar, Descargar PDF, Enviar por correo, Prorrogar, Convenio, Renovar, Castigar, Anular. Las no permitidas por §11.3 aparecen **deshabilitadas con el motivo en el tooltip**, no ocultas.

**"Marcar como pagado" no existe.** Liquidar es registrar el abono que cierra el saldo; un botón que salta la contabilidad es cómo se pierde la trazabilidad.

### 19.6 `/pagares/nuevo`

El admin captura con los valores por defecto de `settings` ya rellenados y elige o crea al deudor. El sistema hace el resto: **genera el folio, crea la cuenta de acceso si no existe, envía credenciales y el aviso de firma**. El pagaré queda en `PENDING_SIGNATURE` hasta que el cliente firme desde iOS. También permite **duplicar** y **emitir en lote** para el mismo deudor.

### 19.7 `/cartera`, `/cobranza`, `/reportes`

- **Cartera:** aging por tramo con monto y conteo — cada barra es un filtro que lleva a `/pagares`; clasificación vigente/vencida; indicadores; calendario de vencimientos.
- **Cobranza:** embudo por etapa (§13.2) con monto y conteo, lista de la etapa seleccionada, y promesas hechas, por vencer, cumplidas e incumplidas. Desde aquí se registra gestión, se captura convenio, se escala o se congela un caso.
- **Reportes:** los nueve de §17.2 con rango y exportación, más descarga masiva de PDFs.

### 19.8 `/clientes` (Deudores), `/usuarios` (Accesos), `/ajustes`

- **Deudores:** saldo total, pagarés vigentes y vencidos, comportamiento de pago derivado del historial, expediente y estado de cuenta descargable.
- **Accesos:** alta con correo y nombre; el sistema genera la temporal, **la muestra una sola vez** con botón de copiar y aviso de que no vuelve a mostrarse, y la envía por correo. Por fila: estado, último acceso, bloqueo, restablecer, desbloquear, suspender.
- **Ajustes:** datos y logo de la organización · valores por defecto (lugares, moneda, tasa, base 360/365, orden de aplicación del abono, plazo) · **umbral de tasa que dispara advertencia** (§25.14) · **plazo de prescripción** (§25.13) · **datos para pagar** (banco, cuenta, referencia) que ve el cliente en la app · prefijos de folio · **reglas de recordatorio con vista previa** · zona horaria.

### 19.9 Cómo se siente

Densidad alta y ruido bajo: comparar 40 filas de un vistazo es la tarea real, así que no hay sombras ni iconos decorativos. Cifras con `tabular-nums`, fechas cortas e inequívocas, dinero siempre con moneda. Todo cambia sin recargar; las acciones con impacto piden motivo y lo guardan. Atajos `⌘K`, `n`, `a`. Accesibilidad: foco visible, teclado completo, contraste AA, estado nunca sólo por color, `aria-live` en avisos. **Móvil:** el admin cobra desde la calle — la tabla se vuelve tarjetas y abono, gestión y llamar quedan al alcance del pulgar.

### 19.10 Lo que el dashboard no hace

Cobrar con pasarela · calcular cuotas o amortizaciones · gestionar roles y permisos (sólo existe el rol admin) · scoring crediticio · **litigar** (registra el expediente y las actuaciones, §13.6; no sustituye al despacho) · **editar un pagaré firmado**.

---

## 20. Disciplina de trabajo y CI

### 20.1 Roles de revisión

Cada cambio pasa por las mismas comprobaciones, en este orden. No son fases de un proceso
formal: son las preguntas que hay que contestar antes de dar algo por hecho.

| Rol | Qué revisa |
|---|---|
| Arquitecto | El módulo sigue la estructura de §3.4 y respeta la regla de dependencias |
| Backend | El caso de uso cuelga de `BaseUseCase`, su schema vive en `contracts` y el test se escribió primero |
| Contrato | `openapi.yaml` y los schemas se editan **antes** del código, y el cambio es compatible hacia atrás |
| Negocio | Interés, aging, tramos y reglas de recordatorio viven en `domain-rules` y en ningún otro sitio |
| Seguridad | El checklist de §9 sobre el diff, con test negativo BOLA/BFLA por endpoint nuevo |
| QA | Dominio, extremo a extremo, N+1, carga y saturación del pool |
| Frontend | Las pantallas de §19 con su design system, accesibilidad y estados vacío, carga y error |
| Rendimiento | Índices, paginación por cursor, caché y presupuesto de bundle |
| Revisión final | Duplicación, servicios "God", lógica en controladores, `any`, catch silencioso |

Las decisiones que cambian el plan o un límite de seguridad se registran en
`docs/adr/NNNN-*.md`, una por archivo.

### 20.2 Comprobaciones automáticas antes de commitear

| Cuándo | Qué corre |
|---|---|
| Antes del commit | `gitleaks protect --staged`; aborta si hay un secreto |
| Al editar un `.ts` | `eslint --fix` y `prettier` sobre el archivo |
| Al editar `schema.prisma` | Recordatorio de migración y `prisma generate` |
| Al terminar un cambio en `apps/api/src` | `pnpm test` |

### 20.3 CI

`lint` → `typecheck` → test unitario → **test de arquitectura** (`dependency-cruiser`, §7) → e2e con Postgres + MinIO → `pnpm audit` → presupuesto de bundle → build.

El cierre obligatorio de cualquier cambio es el mismo: lint, test, arquitectura y gitleaks
antes de dar nada por terminado.

---

## 21. Fases

| Fase | Entregable | Criterio de "hecho" |
|---|---|---|
| **F0 · Andamiaje** | Workspace, Turborepo, configs, servicios locales por Homebrew (Postgres, MinIO, Mailpit), `.env.example` y las comprobaciones automáticas de §20.2 | Servicios arriba; `pnpm verify` en verde |
| **F1 · Contrato** | `openapi.yaml` + `packages/contracts`: todo §15 y el catálogo de errores de §14.4 | Aprobado por ti; genera tipos para api y web |
| **F2 · Núcleo base** | `packages/api-core` con las ocho bases de §5, filtro problem+json, interceptors, cola, **outbox/inbox (§3.3)** e **idempotencia completa (§12.4)** | Matar el proceso entre el commit y la publicación **no** pierde el evento; misma clave con otro cuerpo devuelve 422 |
| **F3 · Dominio del pagaré** | Entidad, VOs, `NoteStatus` con la matriz de §11.3, `amountToWords`, calendario de negocio — **sin Nest** | Cada regla de §11 y §12 con su test |
| **F4 · Identidad** | `users` con roles y bootstrap del primer admin (§25.1), `credentials`, `otp`, `auth`, `audit` según §10 | Tests negativos: enumeración, fuerza bruta, refresh reutilizado, OTP caducado, `pwdVersion` |
| **F5 · Media y firma** | `media` con perfiles, compresión en la petición, `signatures` con evidencia, los **tres modos de firma** (§25.3), storage MinIO | Reducción verificada con imagen real; alfa conservado; `PROCESSING_SIGNATURE → ISSUED` verificado |
| **F6 · Pagarés y abonos** | `numbering`, `settings`, emisión desde el dashboard, listado con cursor, detalle, `payments`, `interest`, vista pública, seed | Dos abonos simultáneos no sobrepasan el saldo; dos altas simultáneas no repiten folio; una reversa deja el original intacto y el saldo cuadra |
| **F7 · Cartera y cobranza** | `collections`, `settlements`, `legal`, clasificación de §11.1, etapas de §13.2, castigo y reversión, avisos de prescripción (§25.13) | El job corrido dos veces no duplica envíos; convenio incumplido revierte solo; aging cuadra con la suma de saldos |
| **F8 · Correo** | Las 21 plantillas de §16, `ResendMailer`, webhooks de entrega | Preview y snapshot de cada plantilla en CI |
| **F9 · Documentos y reportes** | Los cuatro PDFs de §17.1 y los nueve reportes de §17.2 con exportación | PDF < 1 s con firma y alfa correctos; reportes cuadran contra la base |
| **F10 · Dashboard** | Las once rutas de §19.1 | a11y revisada; filtros en URL; temporal visible una vez; colas vacías con mensaje explícito |
| **F10b · Refuerzos** | §24 completo: certificado de evidencia, cadena de hashes, `wa.me` y `tel:`, push APNs, simulador, paquete legal, importación CSV, confirmación escrita en castigo y quita | Cadena de auditoría verificada tras alterar una fila a mano; push y correo dicen lo mismo |
| **F11 · Endurecimiento** | Idempotencia, rate limit, CSP, auditoría OWASP completa, README | Checklist de §9 firmado por `guardian-owasp`; SLOs de §22.1 medidos |

**Si hay que recortar**, en este orden: `/reportes` avanzados → `/cobranza` → canales extra. **Nunca** se recortan validaciones, seguridad, idempotencia ni auditoría.

---

## 22. No funcionales

### 22.1 Objetivos de servicio

| Métrica | Objetivo |
|---|---|
| Disponibilidad de la API | 99.5 % mensual |
| `p95` de lectura | < 300 ms |
| `p95` de escritura | < 600 ms |
| Firma procesada y visible | < 10 s desde el `202` |
| PDF generado | < 1 s |
| Correo entregado a Resend | < 30 s desde el evento |
| LCP del dashboard en 4G | < 2 s |

Verificados en F11 con k6: 100 usuarios concurrentes, 30 minutos, sin degradación ni saturación del pool.

### 22.2 Fuera de alcance

Respaldos, recuperación ante desastres y política de retención de infraestructura **no forman parte de este proyecto**. La operación del VPS y de sus datos queda del lado de la administración del servidor.

### 22.3 Observabilidad

Logs estructurados con `traceId` que viaja del navegador a la API y a la respuesta de error. Alertas en: avisos pendientes que se acumulan sin enviarse, tasa de error alta y bloqueo masivo de cuentas.

### 22.4 Datos personales

El sistema guarda PII (nombre, domicilio, teléfono, firma, IP) y datos financieros: cifrado en tránsito y en reposo, acceso sólo autenticado, bitácora de acceso a pantallas sensibles, retención definida (`AuditLog` 2 años, OTP purgado a diario) y aviso de privacidad enlazado. **La firma y sus metadatos son evidencia: no se borran mientras el pagaré exista.**

### 22.5 Riesgos

| Riesgo | Mitigación |
|---|---|
| Descuadre entre `paidCents` y los abonos | `verify-balances` semanal + test de invariante; la verdad son las filas |
| Doble abono por reintento | `Idempotency-Key` + bloqueo de fila |
| Castigo o quita por error | Motivo de catálogo, `audit` con actor e IP, reversión con anotación (nunca `UPDATE` silencioso) |
| Correo no entregado sin que nadie se entere | Webhooks de Resend → estado visible + alerta de rebotes |
| Cuenta bloqueada a propósito por un tercero | Rate limit por IP que no bloquea, alerta al usuario, desbloqueo del admin |
| Ráfaga de subidas satura la RAM | `sharp` con caché desactivada y concurrencia 1; límite de 5 MB por archivo |
| Cambio de tasa altera intereses ya cobrados | Snapshot por abono; el histórico no se recalcula |
| Pagaré físico extraviado antes del juicio | `physicalDocumentLocation` con responsable y bitácora de custodia |
| Job diario cae y nadie lo nota | Alerta de job sin ejecución en la ventana esperada |

---

## 23. Glosario

Un término, un significado, en código, base de datos, interfaz y conversación.

| Término | Significado exacto aquí |
|---|---|
| **Pagaré** | Título de crédito con los requisitos del art. 170 LGTOC. Firmado, no se edita |
| **Folio** | Identificador legible generado por el servidor (`PAG-2026-000128`) |
| **Suscriptor** | Quien firma y se obliga: el deudor |
| **Beneficiario / acreedor** | A quien se paga |
| **Aval** | Quien garantiza; hasta dos, con firma propia |
| **Abono** | Pago parcial o total registrado contra un pagaré |
| **Saldo** | Importe menos abonos vigentes. No incluye interés, que se muestra aparte |
| **Interés moratorio** | Interés simple por atraso (art. 174), sobre el saldo, no capitalizable |
| **Cartera vigente** | Saldos con menos de 90 días de atraso |
| **Cartera vencida** | Saldos con 90 días naturales o más sin pago |
| **Tramo (`agingBucket`)** | Antigüedad del saldo: `CURRENT`, `D1_30`, `D31_60`, `D61_90`, `D91_120`, `D120_PLUS` |
| **Etapa (`collectionStage`)** | Preventiva, administrativa, extrajudicial, judicial, castigo |
| **Convenio** | Acuerdo de pago en condiciones nuevas |
| **Quita** | Parte del adeudo que el acreedor perdona dentro de un convenio |
| **Reestructura** | Convenio que cambia plazo o condiciones sin documento nuevo |
| **Renovación** | Pagaré nuevo que sustituye a otro; requiere firma nueva |
| **Prórroga** | Extensión del vencimiento conservando documento y firma |
| **Castigo (quebranto)** | Baja contable de un saldo incobrable. **La deuda sigue siendo exigible** |
| **Recuperación** | Abono sobre un pagaré ya castigado |
| **Anulación** | Cancelación de un pagaré emitido por error. Se marca, nunca se borra |
| **Protesto** | Constancia de falta de pago; con el pagaré no es requisito para demandar, pero se documenta |
| **Prescripción** | Plazo tras el cual la acción cambiaria ya no puede ejercerse. El sistema avisa, no la aplica solo (§25.13) |
| **Firma presencial** | El deudor firma en el dispositivo del acreedor, con las salvaguardas de §25.11 |

---

## 24. Refuerzos de producto

Añadidos tras revisar qué hace falta para que esto sea sólido de verdad, no sólo completo. Cada uno dice qué cuesta y por qué entra.

### 24.1 Evidencia de la firma — certificado y cadena de integridad

Ya se capturan los datos (§8.1); lo que faltaba era **poder demostrarlos**.

**Certificado de evidencia** (quinto tipo de documento, §17.1). PDF que acompaña al pagaré con: `sha256` del documento y del trazo, fecha y hora con zona, IP, modelo de dispositivo, versión del sistema y de la app, tipo de entrada (dedo o Pencil), número de trazos, duración de la firma, y el instante exacto de la aceptación. Convierte "tengo una imagen de su firma" en "tengo constancia de cómo y cuándo firmó". Coste: una plantilla más en `documents`.

**Cadena de hashes en la bitácora.** Cada `AuditLog` guarda el hash del registro anterior:

```
chainHash = sha256(prevChainHash || actorId || action || targetId || metadata || createdAt)
```

Si alguien altera o borra una fila directamente en la base, la cadena se rompe y el job `verify-audit-chain` (§18) lo detecta. Coste: dos campos y una función. Beneficio: una bitácora demostrablemente íntegra, no sólo "de confianza".

**Consentimiento con lectura verificada.** En iOS, el botón de firmar **permanece deshabilitado hasta que el usuario recorre el documento completo**, y se registra `scrolledToEndAt` junto a `acceptedAt`. Es la diferencia entre "aceptó" y "leyó y aceptó".

### 24.2 Cobranza por WhatsApp sin proveedor

**Decisión: `wa.me` ahora, API de WhatsApp Business después.**

Un botón en la fila del deudor y en el detalle abre WhatsApp con el mensaje ya redactado desde la plantilla del tramo correspondiente:

```
https://wa.me/52<10 dígitos>?text=<mensaje urlencoded>
```

Sin proveedor, sin coste, sin verificación de Meta, sin plantillas aprobadas. No es envío automático —tú das un tap— pero cubre el canal que la gente sí lee, con el 2 % del trabajo. Lo mismo para teléfono: `tel:` para llamar con un tap desde el escritorio o el móvil.

Se registra como `CollectionActivity` de tipo `WHATSAPP` en cuanto se abre el enlace, así que la gestión queda en la bitácora aunque el envío sea manual.

**La API de WhatsApp Business** (envío automático real) queda documentada como adaptador futuro del puerto `NotificationChannel`: requiere proveedor, verificación de la empresa, plantillas aprobadas por Meta y coste por conversación. Se implementa cuando el volumen lo justifique; no antes.

### 24.3 Notificaciones push a iOS

El correo se lee tarde; el push llega. Adaptador `ApnsChannel` del puerto `NotificationChannel`, con las mismas reglas de idempotencia que el correo (§18).

Se envían: pagaré por firmar, recordatorio de vencimiento, abono registrado, liquidación y aviso de seguridad. **Cada push es un espejo del correo, nunca un canal con contenido distinto** — un solo lugar decide qué se comunica (§13.1).

**El token de dispositivo viaja en el cuerpo del `login` y del `refresh`**, no en un endpoint propio. Así el cliente conserva su regla: sólo `GET` más la ruta de firma. El token se guarda en `DeviceToken`, se rota con la sesión y se borra al cerrar sesión o al revocar la familia.

### 24.4 Mejoras de la app iOS

| Mejora | Qué resuelve | Coste |
|---|---|---|
| **Face ID / Touch ID al abrir** | Son datos financieros en un teléfono que se presta y se pierde | Bajo |
| **Lectura sin señal** | Sus pagarés y saldos desde caché local cifrada; sólo la firma exige red | Bajo |
| **Agregar vencimiento al calendario** | Un tap crea el evento con alarma en su iPhone (EventKit). El recordatorio deja de depender de tu servidor | Bajo |
| **Compartir el PDF** | Share sheet del pagaré y de sus recibos | Muy bajo |
| **Cómo pagar, visible** | Cuenta, banco, referencia y lugar de pago, desde `settings`. Evita la llamada de "¿a dónde deposito?" | Muy bajo |
| **Dynamic Type y VoiceOver** | El lienzo de firma con etiqueta descriptiva; formulario legible a cualquier tamaño | Bajo |

Ninguna rompe la regla de sólo lectura: todas leen o actúan en el dispositivo.

### 24.5 Mejoras del dashboard

| Mejora | Qué resuelve |
|---|---|
| **Simulador de liquidación** | "Si paga el 15 de octubre, debe $X" — capital, interés devengado a esa fecha y total. Mata la calculadora y evita decirle un número equivocado al deudor |
| **Paquete legal en zip** | Un botón arma pagaré + certificado de evidencia + estado de cuenta + bitácora de gestión + escaneos del expediente. Lo que el abogado pide, sin recopilarlo a mano |
| **Importación de cartera por CSV** | Alta inicial de deudores y pagarés existentes, con validación previa y vista de conflictos antes de confirmar |
| **Confirmación escrita en castigo y quita** | Además del motivo de catálogo, hay que teclear el folio para confirmar. Son las dos acciones con impacto económico irreversible (§11.3) |
| **Vista previa y envío de prueba** de cada regla de recordatorio | Ver el correo tal cual le llegará al cliente antes de activarlo |
| **Concentración de riesgo** en el panel | Cuánto de la cartera está en pocos deudores |

### 24.6 Lo que descarto, y por qué

**"Ya pagué" desde la app.** Suena útil, pero convierte al cliente en escritor, obliga a un flujo de aprobación con estados nuevos, y al final tú registras el abono igual cuando lo ves en tu cuenta. No paga su complejidad, y rompe la regla de §0 que hace simple toda la autorización.

**API de WhatsApp Business ahora.** Ver §24.2: coste y fricción hoy, sin volumen que lo justifique.

**Portal web para el cliente.** La app iOS cubre su necesidad; un segundo cliente duplica superficie de ataque y de mantenimiento para el mismo caso de uso.

---
## 25. Detalles de implementación

Detectados en el QA de preparación. Sin ellos, quien escriba el código tiene que inventarlos, y ahí es donde nacen las inconsistencias.

### 25.1 El administrador: dónde vive y cómo nace

Faltaba por completo: el JWT llevaba un claim `role` que **nada producía**.

- **Una sola tabla `User`** con `role: ADMIN | CLIENT`. No hay tabla de administradores aparte: los dos son cuentas con las mismas garantías de contraseña, bloqueo y rotación de tokens (§10). Lo que cambia es el guard y lo que el rol puede pedir (§15).
- **No hay registro público.** Un `CLIENT` sólo nace desde el dashboard; un `ADMIN` sólo nace desde la consola.
- **Primer administrador (bootstrap):** comando `pnpm admin:create` que lee `BOOTSTRAP_ADMIN_EMAIL` del entorno, genera contraseña, la imprime **una vez** en la terminal y exige cambiarla al primer acceso. Falla si ya existe un admin, para que no sea una puerta trasera permanente.
- **Administradores adicionales:** los crea otro admin desde `/usuarios`, con el mismo flujo de temporal de 72 h. En la bitácora se distingue por `actorRole`.
- Un `CLIENT` **nunca** puede escalar a `ADMIN` por la API: el campo `role` no es asignable en ningún endpoint (§9.1, API3).

### 25.2 Deudor y cuenta de acceso: dos cosas distintas

`Debtor` es **la persona que debe**; `User` es **su acceso a la app**. No son lo mismo y la relación es opcional:

```
Debtor 1 ──0..1─► User        (userId String? @unique en Debtor)
PromissoryNote.debtorId  → quién debe (siempre)
PromissoryNote.ownerId   → qué cuenta puede verlo y firmarlo (puede ser null)
```

Esto permite lo que pasa en la realidad: emitir un pagaré a alguien que **no tiene correo**. Ver §25.3 para cómo firma.

Cuando el deudor sí tiene correo, el alta desde `/pagares/nuevo` crea la cuenta y
enlaza `Debtor.userId` **en la misma transacción** que el pagaré: o hay pagaré y
cuenta, o no hay nada. El correo con la contraseña temporal sale por el outbox,
así que sólo se envía si la transacción se confirma.

No hay que pasar antes por **Accesos**: esa pantalla es para dar de alta cuentas
sueltas o gestionarlas, no un paso previo a emitir.

Dos reglas que evitan duplicados, porque `Debtor.userId` es 1-a-1:

- Si ya existe una **cuenta** con ese correo, se reutiliza; no se crea otra.
- Si ya existe un **deudor** con ese correo, se reutiliza aunque el
  administrador lo haya capturado a mano en vez de buscarlo. Crear otro
  partiría su historial en dos.

### 25.3 Las tres formas de firmar

Antes sólo existía la primera, y eso dejaba fuera al deudor sin correo y al aval por completo.

| Modo | Cuándo | Cómo funciona |
|---|---|---|
| **Remota** | El deudor tiene correo y app | Recibe acceso, abre el pagaré en su iPhone y firma (§8) |
| **Presencial** | El deudor está enfrente, con o sin correo | El admin abre el pagaré en su propio dispositivo, entra en **modo firma** —pantalla bloqueada al documento, sin acceso al resto— y el deudor firma ahí. Se registra `signatureMode = IN_PERSON` y el dispositivo del admin en la evidencia (§24.1). Es lo que hace un prestamista cuando presta en mostrador |
| **Del aval** | El pagaré lleva uno o dos avales | Mismo par de vías. Cada aval firma **su propio bloque** (`GuarantorSignature`), con su evidencia independiente. El pagaré **no pasa a `ISSUED` hasta que firman todos los obligados** |

La evidencia distingue siempre los dos modos: una firma presencial no puede presentarse como remota, porque la IP y el dispositivo son los del acreedor y eso queda escrito.

### 25.4 Contrato de paginación

Un solo formato para toda la API, en `packages/contracts`:

```jsonc
// petición
GET /api/v1/admin/notes?limit=50&cursor=eyJkIjoiMjAyNi0wOS0zMCIsImkiOiIwZjFlIn0

// respuesta
{
  "data": [ /* … */ ],
  "page": { "nextCursor": "eyJ…", "hasMore": true, "limit": 50 }
}
```

- El cursor es **opaco**: base64url de `{ campo de orden, id }`. El cliente no lo interpreta ni lo construye.
- Orden estable siempre por `(campoDeOrden, id)` — sin el `id` de desempate, dos filas con la misma fecha pueden repetirse o perderse entre páginas.
- `limit` por defecto 25, máximo 100. Sin `total`: contar toda la cartera en cada página es caro y nadie lo usa. Si hace falta un total, es un endpoint de reporte (§17.2).

### 25.5 Formato de error, literal

```jsonc
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json
{
  "type": "https://api.ejemplo.mx/errors/validation",
  "title": "La solicitud contiene campos inválidos",
  "status": 422,
  "detail": "Revisa los campos marcados.",
  "instance": "/api/v1/admin/notes",
  "traceId": "01J9X7K2M4",
  "errors": [
    { "field": "dueDate",     "code": "due_date_before_issue_date", "message": "La fecha de pago debe ser posterior a la de expedición." },
    { "field": "amountCents", "code": "amount_not_positive",        "message": "El importe debe ser mayor a cero." }
  ]
}
```

`field` usa el **mismo nombre que el schema de `contracts`**, así el formulario pinta el error bajo el campo correcto sin lógica por endpoint. `traceId` viaja también en los logs.

### 25.6 Importe en letra

Regla, no biblioteca externa: función pura en `domain-rules/amount-to-words.ts`, en español de México.

`2500000` centavos MXN → **"VEINTICINCO MIL PESOS 00/100 M.N."**

- Mayúsculas, centavos como `NN/100`, sufijo `M.N.` para pesos mexicanos.
- Casos de prueba obligatorios: `1` (un centavo), `100`, `2100` (veintiún pesos), `1000000`, `21000000`, `100000000` (cien mil), `1000000000` (diez millones), y el singular "UN PESO".
- **La calcula el servidor y sólo el servidor.** Si número y letra discrepan, el documento es impugnable.

### 25.7 Límites concretos de tasa

| Ruta | Límite | Ventana |
|---|---|---|
| `POST /auth/login` | 10 por IP · 5 por cuenta | 15 min |
| `POST /auth/password/forgot` · `/otp` | 5 por cuenta · 20 por IP | 1 h |
| `POST /auth/refresh` | 60 por sesión | 1 h |
| Escrituras del admin | 300 | 1 min |
| Lecturas autenticadas | 600 | 1 min |
| `GET /public/notes/:token` | 30 por IP | 1 min |
| Subida de firma | 10 por cuenta | 1 h |

Contadores en memoria del proceso. Superarlos devuelve `429` con `Retry-After`; el bloqueo de cuenta de §10.2 es independiente y convive con esto.

### 25.8 Migraciones y datos

- **Migraciones Prisma versionadas**, nombre descriptivo, una por cambio conceptual. Revisadas en el PR como código.
- **Expand/contract** para cambios rompientes: primero se añade la columna nueva y se escribe en las dos, luego se migran los datos, y sólo después se borra la vieja. Nunca un `DROP` en el mismo despliegue que introduce el reemplazo.
- **Ningún dato de negocio se borra**: los estados finales y las anulaciones son marcas, no `DELETE`.
- **Seed de desarrollo:** un administrador, tres deudores y doce pagarés repartidos en todos los estados —incluidos vencido, en convenio, castigado y anulado— para que el dashboard nunca se demuestre vacío.
- **Datos personales:** ante una solicitud de baja se anonimiza el `Debtor` (nombre, domicilio, teléfono, correo) **conservando** los pagarés y su evidencia, porque son obligaciones de crédito con su propio plazo legal. La anonimización queda en la bitácora.

### 25.9 Estrategia de pruebas

| Nivel | Qué cubre | Dónde | Meta |
|---|---|---|---|
| **Unitarias de dominio** | Estados y transiciones (§11.3), saldo, interés, importe en letra, calendario, política de contraseña | Sin Nest, sin base | **100 % de las reglas**, no de las líneas |
| **De contrato** | Cada implementación de un puerto pasa la misma batería (§7, L) | Servicios locales (ADR 0014) | Todas las implementaciones |
| **Integración** | Repositorios, transacciones, bloqueo de fila, secuencia de folio | Postgres real | Los caminos con concurrencia |
| **E2E de API** | Los flujos de §0 de punta a punta | supertest + Postgres + MinIO | Los diez flujos principales |
| **Seguridad** | BOLA y BFLA por endpoint, enumeración, fuerza bruta, refresh reutilizado, mass assignment | supertest | **Obligatorio por endpoint nuevo** |
| **Idempotencia y fiabilidad** | Doble abono, doble alta, evento perdido matando el proceso entre commit y publish | Integración | Los cinco endpoints idempotentes |
| **Carga** | 100 usuarios concurrentes, 30 min, sin saturar el pool | k6 | Antes de producción |
| **UI** | a11y automática (axe) y snapshot de las 21 plantillas de correo | Playwright + React Email | Rutas críticas |

Regla: **una prueba por regla de negocio, no por método.** Un caso de uso con cinco reglas tiene cinco pruebas con nombre de regla, no una llamada "should work".

### 25.10 Entornos y despliegue

| Entorno | Para qué | Datos |
|---|---|---|
| **Local** | Desarrollo | Homebrew: Postgres, MinIO y Mailpit. Seed completo |
| **Staging** | Ensayo de despliegue y demo | Copia del esquema, datos ficticios, Resend en modo prueba |
| **Producción** | Operación real | VPS de Hostinger con Dokploy: Postgres, MinIO y Resend |

`apps/api` y `apps/web` se despliegan como dos aplicaciones en Dokploy sobre un VPS de Hostinger. Las migraciones corren como paso previo al despliegue de la API, nunca al arrancar el proceso — arrancar N instancias que migran a la vez es cómo se rompe una base. Variables validadas con zod al arrancar: si falta una, el proceso muere con un mensaje claro en vez de fallar a media operación.

---
### 25.11 Salvaguardas de la firma presencial

La firma en el dispositivo del acreedor es la práctica real del mostrador, pero es también la más fácil de cuestionar: el aparato es tuyo, la IP es tuya. Se compensa con cuatro cosas, todas automáticas:

- El certificado de evidencia (§24.1) **dice explícitamente** que fue presencial, en dispositivo del acreedor, y con qué cuenta de administrador se habilitó. Nunca se presenta como remota.
- **Modo firma bloqueado:** al entrar, la pantalla se limita al documento y al lienzo; no hay navegación ni acceso al resto del dashboard hasta que se firma o se cancela. Salir requiere la sesión del admin.
- **Aceptación separada del trazo:** el deudor marca la casilla de aceptación y sólo entonces se habilita el lienzo. Se registran los dos instantes, junto con `scrolledToEndAt`.
- Queda en la bitácora como acción del admin: quién la habilitó, cuándo y desde dónde.

Cuando el deudor tiene correo, **la firma remota es siempre preferible** y el sistema la ofrece primero: la evidencia es más fuerte porque el dispositivo y la IP son suyos.

### 25.12 Deudor sin correo

Un deudor sin correo puede tener pagarés, pero **el sistema no puede avisarle solo**. Para que eso no se convierta en un agujero silencioso:

- `Debtor.email` es opcional; `Debtor.phone` es obligatorio.
- Las reglas de recordatorio (§13.1) que no encuentran canal automático **no se descartan**: generan una tarea en la bandeja de Hoy — *"recordar a Juan Pérez, sin correo"* — con el enlace `wa.me` y el `tel:` ya listos (§24.2).
- El dashboard marca esos deudores con una etiqueta de **contacto limitado**, para que se sepa que dependen de gestión manual.

### 25.13 Prescripción de la acción cambiaria

Un pagaré no se cobra para siempre: la acción cambiaria directa **prescribe a los tres años** del vencimiento (art. 165 LGTOC). Un sistema que no lo avisa deja que un adeudo cobrable se vuelva incobrable en silencio.

- `prescribesOn = dueDate + 3 años`, con el plazo **configurable en `settings`** por si el criterio cambia o tu abogado sostiene otro cómputo.
- Avisos automáticos a los **180, 90 y 30 días** antes de esa fecha, en la bandeja de Hoy y en el resumen semanal del administrador.
- Tramo **"por prescribir"** en la pestaña de vencidos y en el reporte de cartera vencida.
- El aviso es informativo: el sistema **no** cambia el estado por prescripción, porque hay actos que la interrumpen y esa valoración es jurídica, no automática.

> Este punto toca derecho sustantivo. El plazo y su cómputo deben confirmarse con tu abogado; el sistema los trata como configuración, no como verdad grabada.

### 25.14 Tope de interés

Los tribunales mexicanos han reducido intereses moratorios considerados usurarios. El sistema no juzga, pero **avisa**: si al emitir un pagaré la tasa supera el umbral configurado en `settings`, aparece una advertencia visible con el dato de la tasa y se pide confirmar. La decisión es tuya y queda en la bitácora.

### 25.16 Requisitos del pagaré y fuerza ejecutiva

**Las seis menciones del art. 170 LGTOC están todas**, en el documento del
dashboard y en el PDF, que comparten presenter:

| # | Requisito | Dónde |
|---|---|---|
| I | La mención de ser **pagaré**, inserta en el texto | Encabezado del documento |
| II | Promesa **incondicional** de pagar una suma determinada | "Debo(emos) y pagaré(mos) incondicionalmente…" con importe en número y letra |
| III | Nombre de la persona a quien ha de hacerse el pago | `creditorName` |
| IV | **Época y lugar** del pago | `dueDate` y `paymentPlace` |
| V | **Fecha y lugar** de suscripción | `issueDate` y `issuePlace` |
| VI | **Firma del suscriptor** | Bloque de firma, con evidencia (§24.1) |

Añadidos que no exige el artículo pero lleva el formulario impreso: interés
moratorio con su periodicidad (§12.3), domicilio y teléfono del suscriptor,
moneda, observaciones y **avales con su propio bloque de firma** (arts. 109-116,
aplicables al pagaré por el 174).

**Lo que este sistema NO da por sí solo: fuerza ejecutiva plena en juicio.**
La firma que se captura en el iPhone es **firma electrónica simple**. Los
tribunales han sostenido que un pagaré digital produce efectos plenos cuando
lleva **firma electrónica avanzada** emitida por un prestador de servicios de
certificación y cumple la **NOM-151** —constancia de conservación del mensaje de
datos, sello de tiempo y certificación—; una firma trazada en pantalla no
sustituye a la autógrafa para efectos del art. 170 fr. VI.

Qué hace este sistema al respecto, sin prometer lo que no puede:

- Genera el **certificado de evidencia de firma** (hashes, dispositivo, momento,
  lectura verificada) y encadena la bitácora (§14.5): eso sostiene la deuda como
  prueba documental, y ayuda muchísimo en juicio ordinario.
- Guarda el **paquete legal** (§17.1) para acompañar la demanda.
- **No** emite constancia NOM-151 ni firma avanzada: eso requiere un PSC.

**Decisión operativa:** para pagarés donde importe poder ir a la vía ejecutiva,
o se conserva el original en papel firmado de puño y letra —el sistema lo
registra en el expediente legal—, o se integra un PSC para firma avanzada. Es un
punto de integración conocido, no un descuido.

### 25.15 Alcance de avales y moneda

- **Avales opcionales**, cero, uno o dos, como el formulario impreso. Se decide al emitir: si el pagaré declara avales, **no llega a `ISSUED` hasta que todos firmen** (§25.3). Un aval no puede añadirse después de la firma — eso sería un documento nuevo (renovación).
- **Una sola moneda por instalación**, definida en `settings` (`MXN` por defecto). El importe en letra (§25.6) está escrito para pesos mexicanos; añadir otra moneda exige su propia regla de conversión a letra y su formato, y hoy no aporta nada.

---

## 26. Decisiones cerradas

1. **Motor de PDF:** `@react-pdf/renderer`; Puppeteer queda como adaptador de reserva tras el puerto `PdfRenderer` (§17.1).
2. **Zona horaria:** `America/Mexico_City`, zona IANA y no offset; corte diario 00:05 (§12.1).
3. **Storage:** SDK de S3 con **MinIO** en local y en el VPS. Sin servicios externos. Cambiar a S3 o R2 más adelante es una variable de entorno, porque el puerto `ObjectStorage` no distingue.
4. **Contraseñas:** ≥ 12 caracteres, contraste contra filtradas por k-anonymity, sin caducidad forzada, sin repetir las 5 últimas (§10.2).
5. **Temporal por correo:** sí, con 72 h de caducidad y un solo uso; el admin también la ve una vez (§10.3).
6. **OTP:** sólo para cambio y recuperación de contraseña.
7. **Cuota de cambios:** 3 por 7 días; el reset del admin la pone a cero.
8. **Bloqueo:** 5 intentos → 5 h, por cuenta, con las tres compensaciones de §10.2.
9. **Apple/Google Sign-In:** sólo el esquema `Identity(provider, subject)`; sin endpoints hasta que exista la app iOS.
10. **Abonos libres:** sin cuotas, sin amortización, sin pasarela.
11. **Emisión:** sólo el admin crea pagarés; iOS firma y consulta (§15).
12. **Canales:** correo y **push APNs** implementados. WhatsApp por **enlace `wa.me` manual** (sin proveedor ni coste); la API de WhatsApp Business queda como adaptador futuro. `SMS` en el enum, sin adaptador (§24.2).
13. **Sin subagentes:** el equipo son skills y hooks (§20).
14. **Encuadre: acreedor particular**, no entidad regulada (§0). Quedan fuera, con el puerto listo: reporte a Buró de Crédito, régimen PLD completo y provisiones contables automáticas.
15. **Emisión y firma:** el admin emite y manda a firmar; el cliente sólo firma y consulta (§0, §15).
16. **Cliente de sólo lectura:** su única escritura es la firma. El token de push viaja en el `login`/`refresh`, no en un endpoint propio, para no abrir una segunda vía de escritura (§24.3).
17. **Descartado:** "ya pagué" desde la app, API de WhatsApp Business hoy, y portal web para el cliente (§24.6).
18. **Sin worker, sin cola, sin Redis:** el trabajo pesado corre en la petición y los avisos se despachan tras confirmar la transacción (§18).
19. **Firma:** tres modos —remota, presencial y de aval— con la remota como preferente y salvaguardas explícitas en la presencial (§25.3, §25.11).
20. **Una moneda por instalación** (`MXN` por defecto); el importe en letra está escrito para pesos mexicanos (§25.15).
21. **Prescripción y tope de interés:** el sistema **avisa**, no decide. Plazos y umbrales viven en `settings` y deben confirmarse con tu abogado (§25.13, §25.14).

---

## 27. Pendiente de ti

- [ ] Aprobar §3 (módulos y eventos), §11 (estados) y §15 (endpoints) — son la columna vertebral.
- [ ] **Rotar la `RESEND_API_KEY`** compartida en el chat.
