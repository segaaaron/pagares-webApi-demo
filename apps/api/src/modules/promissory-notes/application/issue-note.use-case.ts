import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import type { CreateNoteRequest } from '@pagares/contracts';
import type { DomainEvent } from '@pagares/api-core';
import {
  addYears,
  amountToWords,
  buildPaymentPlan,
  businessToday,
  installmentDates,
  toAnnualRatePct,
} from '@pagares/domain-rules';
import {
  CLIENT_ACCOUNT_PROVISIONER,
  type ClientAccountProvisioner,
} from '../domain/ports/client-account.js';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { NumberingService } from '../../numbering/numbering.service.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { assertNoteInvariants } from '../domain/note-invariants.js';
import { DebtorHasUnsignedNoteError } from '../domain/note.errors.js';

/**
 * Llave del cerrojo que serializa la emisión por deudor.
 *
 * Sin él, dos altas a la vez para el mismo deudor leen las dos que no hay nada
 * pendiente y las dos emiten: la regla de «nada nuevo sin firmar» sería un
 * adorno. Se toma por teléfono, así que no estorba a nadie más (§12).
 */
const ISSUE_LOCK = 776_2;

export interface IssueNoteOutput {
  id: string;
  folio: string;
  status: string;
  amountInWords: string;
  publicUrl: string;
  /**
   * La serie completa cuando la deuda se documentó en varios pagos.
   *
   * El primero encabeza la respuesta —es el que se abre y el que se manda a
   * firmar—, y aquí van todos para que la pantalla pueda enseñar el calendario
   * recién creado sin volver a preguntar.
   */
  series: {
    id: string;
    size: number;
    notes: { id: string; folio: string; index: number; dueDate: string; amountCents: string }[];
    /** Lo pactado: cuánto se presta, cuánto se gana y cuánto se cobra. */
    plan: {
      model: string;
      principalCents: string;
      /** El precio del préstamo: lo que gana quien presta. */
      totalInterestCents: string;
      totalCents: string;
    };
  } | null;
}

/**
 * Emisión de un pagaré (§19.6). Sólo el administrador emite; el cliente firma.
 *
 * Todo lo derivado se calcula aquí y no se acepta del cliente: folio, importe en
 * letra, token público y fecha de prescripción. Si el número y la letra
 * discreparan, el documento sería impugnable.
 */
@Injectable()
export class IssueNoteUseCase extends BaseUseCase<CreateNoteRequest, IssueNoteOutput> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CLIENT_ACCOUNT_PROVISIONER) private readonly accounts: ClientAccountProvisioner,
  ) {
    super(new NestUseCaseLogger(IssueNoteUseCase.name));
  }

  protected async handle(input: CreateNoteRequest, ctx: ExecutionContext): Promise<IssueNoteOutput> {
    const now = this.clock.now();
    const today = businessToday(now);
    const amountCents = BigInt(input.amountCents);

    assertNoteInvariants({ amountCents, issueDate: input.issueDate, dueDate: input.dueDate }, today);

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const prescriptionYears = settings?.prescriptionYears ?? 3;

    /*
     * Un pagaré es de pago único, así que documentar doce mensualidades es
     * emitir doce títulos con el mismo criterio: el importe repartido sin perder
     * un centavo y los vencimientos mes a mes desde el pactado (§12).
     *
     * Las dos reglas viven en `domain-rules` y aquí sólo se aplican: repartir
     * dinero es exactamente el tipo de cuenta que no puede estar en un caso de
     * uso, donde nadie la prueba.
     */
    /*
     * El plan decide cuánto dice cada pagaré. Sin interés ordinario es el
     * reparto del capital de siempre; con él, cada cuota lleva además el precio
     * del préstamo —lo que gana quien presta— calculado sobre saldos insolutos
     * o sobre el importe original, según lo pactado (§12).
     */
    const plan = buildPaymentPlan({
      principalCents: amountCents,
      annualRatePct:
        input.plan.model === 'NONE' || input.plan.rate === null
          ? null
          : toAnnualRatePct(input.plan.rate.value, input.plan.rate.period),
      installments: input.installments,
      model: input.plan.model,
    });
    /*
     * El teléfono es la identidad del deudor a efectos de la regla del ADR
     * 0019: es obligatorio, el correo no, y es el mismo criterio con el que la
     * importación reconoce a quién pertenece cada fila (§24.5).
     */
    const telefonoDelDeudor = input.debtor.phone.replace(/[\s()-]/g, '');
    const vencimientos = installmentDates(input.dueDate, input.installments);
    const enSerie = input.installments > 1;
    const seriesId = enSerie ? randomUUID() : null;

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      /*
       * El cerrojo va por **teléfono** y antes de resolver al deudor: si se
       * tomara sobre su ficha, dos altas simultáneas de alguien que todavía no
       * existe crearían dos fichas, cada una con su llave, y no se estorbarían.
       * El teléfono es la identidad desde antes de la primera fila.
       */
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ISSUE_LOCK}::int, hashtext(${telefonoDelDeudor})::int)`;

      await this.assertNadaPendienteDeFirma(tx, telefonoDelDeudor);

      const debtor = await this.resolveDebtor(tx, scope, input, ctx);

      const creados: {
        id: string;
        folio: string;
        index: number;
        dueDate: string;
        amountCents: string;
        publicToken: string;
        status: string;
        amountInWords: string;
      }[] = [];

      for (const [posicion, cuota] of plan.rows.entries()) {
        const importe = cuota.paymentCents;
        const vencimiento = vencimientos[posicion] as string;
        // Un folio por título: cada pagaré de la serie es un documento
        // independiente y se reclama por separado.
        const folio = await this.numbering.next(tx, 'NOTE', Number(today.slice(0, 4)), {
          prefix: settings?.noteFolioPrefix ?? 'PAG',
          padding: 6,
        });

        const note = await tx.promissoryNote.create({
          data: {
            folio,
            publicToken: randomBytes(16).toString('hex'), // 128 bits: consultable, no enumerable
            status: 'PENDING_SIGNATURE',
            issuePlace: input.issuePlace,
            issueDate: new Date(`${input.issueDate}T00:00:00Z`),
            paymentPlace: input.paymentPlace,
            dueDate: new Date(`${vencimiento}T00:00:00Z`),
            prescribesOn: new Date(`${addYears(vencimiento, prescriptionYears)}T00:00:00Z`),
            creditorName: input.creditorName,
            // La forma del título se congela al emitir: cambiar la preferencia
            // mañana no puede cambiar lo que dice un documento ya firmado.
            negotiable: !(settings?.issueNonNegotiable ?? false),
            amountCents: importe,
            currency: input.currency,
            amountInWords: amountToWords(importe),
            // El papel dice lo pactado; la aritmética usa la anual (§12.3).
            interestRateAnnualPct:
              input.interestRate === null
                ? null
                : toAnnualRatePct(input.interestRate.value, input.interestRate.period),
            interestPeriod: input.interestRate?.period ?? 'ANNUAL',
            observations: input.observations ?? null,
            requiresGuarantors: input.requiresGuarantors,
            debtorId: debtor.id,
            ownerId: debtor.userId,
            createdBy: ctx.actorId ?? 'system',
            ...(seriesId
              ? { seriesId, seriesIndex: posicion + 1, seriesSize: input.installments }
              : {}),
            // De qué está hecha la cuota, tal como se pactó (§12).
            planModel: input.plan.model,
            planInterestCents: cuota.interestCents,
            planPrincipalCents: cuota.principalCents,
            guarantors: {
              create: input.guarantors.map((g) => ({
                position: g.position,
                fullName: g.fullName,
                address: g.address,
                phone: g.phone,
              })),
            },
          },
        });

        creados.push({
          id: note.id,
          folio: note.folio,
          index: posicion + 1,
          dueDate: vencimiento,
          amountCents: importe.toString(),
          publicToken: note.publicToken,
          status: note.status,
          amountInWords: note.amountInWords,
        });
      }

      const primero = creados[0] as (typeof creados)[number];

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'note.issue',
          targetType: 'PromissoryNote',
          targetId: primero.id,
          metadata: {
            folio: primero.folio,
            amountCents: amountCents.toString(),
            ...(seriesId ? { seriesId, installments: input.installments } : {}),
          },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      /*
       * Un solo aviso para toda la serie. Doce correos por una misma operación
       * son doce oportunidades de que el deudor deje de leerlos; el mensaje
       * dice cuántos pagarés hay que firmar y enlaza al primero.
       */
      scope.publish({
        eventId: randomUUID(),
        eventType: 'NoteIssued',
        occurredAt: now,
        payload: {
          noteId: primero.id,
          folio: primero.folio,
          debtorId: debtor.id,
          ownerId: debtor.userId,
          ...(seriesId ? { seriesId, installments: input.installments } : {}),
          /*
           * Lo pactado viaja con el aviso cuando la serie lleva interés (§12):
           * sin esto el correo decía «12 pagarés» y el importe del primero, y
           * el deudor tenía que multiplicar para saber a cuánto se compromete.
           */
          ...(plan.totalInterestCents > 0n
            ? {
                planTotalCents: plan.totalCents.toString(),
                planInterestCents: plan.totalInterestCents.toString(),
              }
            : {}),
        },
      });

      return {
        id: primero.id,
        folio: primero.folio,
        status: primero.status,
        amountInWords: primero.amountInWords,
        publicUrl: `/p/${primero.publicToken}`,
        series: seriesId
          ? {
              id: seriesId,
              size: input.installments,
              notes: creados.map(({ id, folio, index, dueDate, amountCents: importe }) => ({
                id,
                folio,
                index,
                dueDate,
                amountCents: importe,
              })),
              plan: {
                model: plan.model,
                principalCents: plan.principalCents.toString(),
                totalInterestCents: plan.totalInterestCents.toString(),
                totalCents: plan.totalCents.toString(),
              },
            }
          : null,
      };
    });
  }

  /**
   * Nada nuevo mientras quede algo sin firmar (ADR 0019).
   *
   * Un pagaré sin firma no obliga al deudor: es una petición, no una deuda.
   * Emitirle otro encima acumula papeles que no valen y deja al administrador
   * sin saber qué aceptó de verdad. La serie no cuenta contra sí misma —sus
   * cuotas nacen en el mismo acto— porque la comprobación corre antes de
   * crearlas.
   */
  private async assertNadaPendienteDeFirma(tx: TxClient, phone: string): Promise<void> {
    /*
     * Se busca por **teléfono** y no por ficha a propósito.
     *
     * Por ficha, volver a teclear al mismo deudor —el correo es opcional— creaba
     * una ficha nueva sin nada pendiente y la regla se saltaba sola. Y unir las
     * fichas por teléfono tampoco vale: dos personas que comparten línea
     * acabarían con el pagaré de una emitido a nombre de la otra, que es un
     * defecto peor y silencioso. Así la regla no se puede burlar y cada ficha
     * sigue siendo de quien es.
     */
    const pendiente = await tx.promissoryNote.findFirst({
      where: {
        debtor: { phone: { in: [phone, `+${phone.replace(/^\+/, '')}`] } },
        status: { in: ['PENDING_SIGNATURE', 'PROCESSING_SIGNATURE'] },
      },
      orderBy: { createdAt: 'asc' },
      select: { folio: true },
    });

    if (pendiente) throw new DebtorHasUnsignedNoteError(pendiente.folio);
  }

  /**
   * Reutiliza el deudor si ya existe; si no, lo crea con el pagaré.
   *
   * Y en los dos casos: **si tiene correo y todavía no tiene cuenta, se le
   * crea aquí mismo** (§25.2). Antes había que ir a Accesos a darlo de alta a
   * mano, con el riesgo de emitir un pagaré que su dueño no podía ver ni
   * firmar. Todo en la misma transacción: o hay pagaré y cuenta, o no hay nada.
   */
  private async resolveDebtor(
    tx: TxClient,
    scope: { publish: (event: DomainEvent) => void },
    input: CreateNoteRequest,
    ctx: ExecutionContext,
  ): Promise<{ id: string; userId: string | null }> {
    /*
     * Si el correo ya es de un deudor, se reutiliza ese deudor aunque el
     * administrador lo haya capturado a mano en vez de buscarlo. Crear otro
     * partiría su historial en dos y, además, chocaría contra el índice único
     * de la cuenta enlazada: `Debtor.userId` es 1-a-1 (§25.2).
     */
    const byEmail =
      !input.debtor.id && input.debtor.email
        ? await tx.debtor.findFirst({ where: { email: input.debtor.email.toLowerCase() } })
        : null;

    const debtor = input.debtor.id
      ? await tx.debtor.findUniqueOrThrow({ where: { id: input.debtor.id } })
      : (byEmail ??
        (await tx.debtor.create({
          data: {
            fullName: input.debtor.fullName,
            address: input.debtor.address,
            phone: input.debtor.phone,
            email: input.debtor.email?.toLowerCase() ?? null,
          },
        })));

    const email = debtor.email ?? input.debtor.email?.toLowerCase() ?? null;
    if (debtor.userId !== null || email === null) {
      return { id: debtor.id, userId: debtor.userId };
    }

    const account = await this.accounts.ensureForEmail({
      tx,
      publish: (event) => scope.publish(event as DomainEvent),
      email,
      fullName: debtor.fullName,
      phone: debtor.phone,
      actorId: ctx.actorId ?? undefined,
    });

    await tx.debtor.update({ where: { id: debtor.id }, data: { userId: account.userId } });
    return { id: debtor.id, userId: account.userId };
  }
}
