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
import { addYears, amountToWords, businessToday, toAnnualRatePct } from '@pagares/domain-rules';
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

export interface IssueNoteOutput {
  id: string;
  folio: string;
  status: string;
  amountInWords: string;
  publicUrl: string;
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

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      const debtor = await this.resolveDebtor(tx, scope, input, ctx);
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
          dueDate: new Date(`${input.dueDate}T00:00:00Z`),
          prescribesOn: new Date(`${addYears(input.dueDate, prescriptionYears)}T00:00:00Z`),
          creditorName: input.creditorName,
          // La forma del título se congela al emitir: cambiar la preferencia
          // mañana no puede cambiar lo que dice un documento ya firmado.
          negotiable: !(settings?.issueNonNegotiable ?? false),
          amountCents,
          currency: input.currency,
          amountInWords: amountToWords(amountCents),
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

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'note.issue',
          targetType: 'PromissoryNote',
          targetId: note.id,
          metadata: { folio, amountCents: amountCents.toString() },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: 'NoteIssued',
        occurredAt: now,
        payload: { noteId: note.id, folio, debtorId: debtor.id, ownerId: debtor.userId },
      });

      return {
        id: note.id,
        folio: note.folio,
        status: note.status,
        amountInWords: note.amountInWords,
        publicUrl: `/p/${note.publicToken}`,
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
