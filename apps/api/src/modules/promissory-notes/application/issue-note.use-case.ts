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
   * El calendario del pagaré cuando la deuda se paga en cuotas (ADR 0022).
   *
   * Va en la respuesta para que la pantalla enseñe la tabla recién creada sin
   * volver a preguntar. Es nulo cuando se paga de una sola vez.
   */
  schedule: {
    size: number;
    /** Cada cuánto se paga: `MONTHLY` o `BIWEEKLY`. */
    frequency: string;
    installments: {
      index: number;
      dueOn: string;
      amountCents: string;
      interestCents: string;
      principalCents: string;
    }[];
    /** Lo pactado: cuánto se presta, cuánto se gana y cuánto dice el título. */
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
    /* Lo que se presta. Lo que el título acaba diciendo lo decide el plan. */
    const principalCents = BigInt(input.amountCents);

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const prescriptionYears = settings?.prescriptionYears ?? 3;

    /*
     * El plan decide qué dice el título y qué dice su tabla. Sin interés
     * ordinario es el reparto del capital de siempre; con él, cada cuota lleva
     * además el precio del préstamo —lo que gana quien presta— calculado sobre
     * saldos insolutos o sobre el importe original, según lo pactado (§12).
     *
     * Repartir dinero vive en `domain-rules` y aquí sólo se aplica: es
     * exactamente el tipo de cuenta que no puede estar en un caso de uso, donde
     * nadie la mira.
     */
    const plan = buildPaymentPlan({
      principalCents,
      annualRatePct:
        input.plan.model === 'NONE' || input.plan.rate === null
          ? null
          : toAnnualRatePct(input.plan.rate.value, input.plan.rate.period),
      installments: input.installments,
      model: input.plan.model,
      frequency: input.paymentFrequency,
    });

    /*
     * Lo que el título exige es capital más interés ordinario (ADR 0022). Sin
     * plan coincide con lo prestado; con él no, y el pagaré tiene que decir lo
     * que se debe, no lo que se entregó.
     */
    const amountCents = plan.totalCents;

    /*
     * `dueDate` es la **primera** cuota; el título vence con la **última**.
     *
     * Un solo vencimiento en la literalidad del documento (ADR 0022): el art.
     * 79 LGTOC vuelve pagadero a la vista lo que lleva vencimientos sucesivos
     * dentro, y aquí el calendario no está dentro del título sino al lado, que
     * es lo que contemplan los arts. 17 y 130 al obligar a recibir abonos.
     */
    const vencimientos = installmentDates(
      input.dueDate,
      input.installments,
      input.paymentFrequency,
    );
    const dueDate = vencimientos.at(-1) as string;
    const enCuotas = input.installments > 1;

    assertNoteInvariants({ amountCents, issueDate: input.issueDate, dueDate }, today);

    /*
     * El teléfono es la identidad del deudor a efectos de la regla del ADR
     * 0019: es obligatorio, el correo no, y es el mismo criterio con el que la
     * importación reconoce a quién pertenece cada fila (§24.5).
     */
    const telefonoDelDeudor = normalizePhone(input.debtor.phone);

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      /*
       * Antes de resolver al deudor: el cerrojo va por teléfono, que es la
       * identidad desde antes de que exista su primera ficha (ADR 0019).
       */
      const debtor = await this.resolveDebtor(tx, scope, input, ctx);

      const note = await this.notes.create(
        tx,
        {
          debtorId: debtor.id,
          ownerId: debtor.userId,
          debtorPhone: telefonoDelDeudor,
          issuePlace: input.issuePlace,
          issueDate: input.issueDate,
          paymentPlace: input.paymentPlace,
          dueDate,
          creditorName: input.creditorName,
          amountCents,
          currency: input.currency,
          paymentFrequency: input.paymentFrequency,
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
          // De qué está hecho el importe del título, tal como se pactó (§12).
          plan: {
            model: input.plan.model,
            interestCents: plan.totalInterestCents,
            principalCents: plan.principalCents,
          },
          /*
           * La tabla de amortización sólo existe cuando hay más de una cuota:
           * un pagaré de pago único ya la lleva escrita en su propio importe y
           * su propia fecha, y guardar una fila para decir lo mismo sería una
           * segunda verdad esperando a desincronizarse.
           */
          ...(enCuotas
            ? {
                schedule: plan.rows.map((cuota, posicion) => ({
                  index: cuota.index,
                  dueOn: vencimientos[posicion] as string,
                  amountCents: cuota.paymentCents,
                  interestCents: cuota.interestCents,
                  principalCents: cuota.principalCents,
                })),
              }
            : {}),
          createdBy: ctx.actorId ?? 'system',
        },
        'issue',
        { folioPrefix: settings?.noteFolioPrefix ?? 'PAG', prescriptionYears },
      );

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'note.issue',
          targetType: 'PromissoryNote',
          targetId: note.id,
          metadata: {
            folio: note.folio,
            amountCents: amountCents.toString(),
            principalCents: plan.principalCents.toString(),
            ...(enCuotas ? { installments: input.installments } : {}),
          },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: 'NoteIssued',
        occurredAt: now,
        payload: {
          noteId: note.id,
          folio: note.folio,
          debtorId: debtor.id,
          ownerId: debtor.userId,
          ...(enCuotas ? { installments: input.installments } : {}),
          /*
           * Lo pactado viaja con el aviso cuando el plan lleva interés (§12):
           * sin esto el correo decía el importe y el deudor tenía que
           * multiplicar para saber a cuánto se compromete.
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
        id: note.id,
        folio: note.folio,
        status: note.status,
        amountInWords: note.amountInWords,
        publicUrl: `/p/${note.publicToken}`,
        schedule: enCuotas
          ? {
              size: input.installments,
              frequency: input.paymentFrequency,
              installments: plan.rows.map((cuota, posicion) => ({
                index: cuota.index,
                dueOn: vencimientos[posicion] as string,
                amountCents: cuota.paymentCents.toString(),
                interestCents: cuota.interestCents.toString(),
                principalCents: cuota.principalCents.toString(),
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
