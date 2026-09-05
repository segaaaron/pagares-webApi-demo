import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { assertNoteInvariants } from '../domain/note-invariants.js';
import { normalizePhone } from './assert-nothing-unsigned.js';
import { NoteFactory } from './note-factory.js';


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
    private readonly notes: NoteFactory,
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
    const telefonoDelDeudor = normalizePhone(input.debtor.phone);
    const vencimientos = installmentDates(input.dueDate, input.installments);
    const enSerie = input.installments > 1;
    const seriesId = enSerie ? randomUUID() : null;

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      /*
       * Antes de resolver al deudor: el cerrojo va por teléfono, que es la
       * identidad desde antes de que exista su primera ficha (ADR 0019).
       */
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
        const note = await this.notes.create(
          tx,
          {
            debtorId: debtor.id,
            ownerId: debtor.userId,
            debtorPhone: telefonoDelDeudor,
            issuePlace: input.issuePlace,
            issueDate: input.issueDate,
            paymentPlace: input.paymentPlace,
            dueDate: vencimiento,
            creditorName: input.creditorName,
            amountCents: importe,
            currency: input.currency,
            // El papel dice lo pactado; la aritmética usa la anual (§12.3).
            interestRateAnnualPct:
              input.interestRate === null
                ? null
                : toAnnualRatePct(input.interestRate.value, input.interestRate.period),
            interestPeriod: input.interestRate?.period ?? 'ANNUAL',
            // La forma del título se congela al emitir: cambiar la preferencia
            // mañana no puede cambiar lo que dice un documento ya firmado.
            negotiable: !(settings?.issueNonNegotiable ?? false),
            observations: input.observations ?? null,
            requiresGuarantors: input.requiresGuarantors,
            guarantors: input.guarantors.map((g) => ({
              position: g.position,
              fullName: g.fullName,
              address: g.address,
              phone: g.phone,
            })),
            ...(seriesId
              ? { series: { id: seriesId, index: posicion + 1, size: input.installments } }
              : {}),
            // De qué está hecha la cuota, tal como se pactó (§12).
            plan: {
              model: input.plan.model,
              interestCents: cuota.interestCents,
              principalCents: cuota.principalCents,
            },
            createdBy: ctx.actorId ?? 'system',
          },
          'issue',
          { folioPrefix: settings?.noteFolioPrefix ?? 'PAG', prescriptionYears },
        );

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
