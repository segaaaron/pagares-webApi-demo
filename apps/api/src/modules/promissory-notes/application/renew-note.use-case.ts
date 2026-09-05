import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { addYears, amountToWords, businessToday } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { assertNothingUnsigned } from './assert-nothing-unsigned.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { NumberingService } from '../../numbering/numbering.service.js';
import { FINAL_STATUSES } from '../domain/note-status.js';

export interface RenewNoteInput {
  noteId: string;
  newDueDate: string;
  /** Si se omite, el nuevo pagaré arrastra el saldo pendiente del anterior. */
  amountCents?: string | undefined;
  reason: string;
}

/**
 * Renovación (§13.5).
 *
 * A diferencia de la prórroga, aquí nace un documento nuevo: el anterior se
 * cierra como `RENEWED` y el nuevo queda `PENDING_SIGNATURE`, porque **exige
 * firma nueva**. Un pagaré no puede cambiar de importe conservando la firma que
 * amparaba otro importe.
 */
@Injectable()
export class RenewNoteUseCase extends BaseUseCase<RenewNoteInput, { id: string; folio: string }> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(RenewNoteUseCase.name));
  }

  protected async handle(input: RenewNoteInput, ctx: ExecutionContext): Promise<{ id: string; folio: string }> {
    const now = this.clock.now();
    const today = businessToday(now);
    const previous = await this.prisma.promissoryNote.findUniqueOrThrow({ where: { id: input.noteId } });

    if (FINAL_STATUSES.has(previous.status)) {
      throw new BadRequestException('Un pagaré en estado final no se puede renovar');
    }
    if (input.newDueDate <= today) {
      throw new BadRequestException('El vencimiento del pagaré nuevo debe ser posterior a hoy');
    }

    const balance = previous.amountCents - previous.paidCents;
    const amountCents = input.amountCents ? BigInt(input.amountCents) : balance;
    if (amountCents <= 0n) throw new BadRequestException('No hay saldo que renovar');

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const prescriptionYears = settings?.prescriptionYears ?? 3;

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      const actor = ctx.actorId ?? 'system';

      /*
       * Renovar crea un pagaré nuevo que el deudor tiene que firmar, así que la
       * regla del ADR 0019 también manda aquí: nada nuevo mientras quede algo
       * sin firmar.
       *
       * El que se renueva **no cuenta contra sí mismo** —pasa a RENEWED y deja
       * de deberse—, porque renovar no suma un título: lo cambia por otro. Lo
       * que la regla impide es que el deudor acabe con dos papeles sin firma.
       */
      const deudor = await tx.debtor.findUniqueOrThrow({
        where: { id: previous.debtorId },
        select: { phone: true },
      });
      await assertNothingUnsigned(tx, deudor.phone, previous.id);

      const folio = await this.numbering.next(tx, 'NOTE', Number(today.slice(0, 4)), {
        prefix: settings?.noteFolioPrefix ?? 'PAG',
        padding: 6,
      });

      const created = await tx.promissoryNote.create({
        data: {
          folio,
          publicToken: randomBytes(16).toString('hex'),
          status: 'PENDING_SIGNATURE',
          issuePlace: previous.issuePlace,
          issueDate: new Date(`${today}T00:00:00Z`),
          paymentPlace: previous.paymentPlace,
          dueDate: new Date(`${input.newDueDate}T00:00:00Z`),
          prescribesOn: new Date(`${addYears(input.newDueDate, prescriptionYears)}T00:00:00Z`),
          creditorName: previous.creditorName,
          // La renovación conserva la forma del título que sustituye: es el
          // mismo trato, con otra fecha.
          negotiable: previous.negotiable,
          amountCents,
          currency: previous.currency,
          amountInWords: amountToWords(amountCents),
          interestRateAnnualPct: previous.interestRateAnnualPct,
          observations: `Renovación de ${previous.folio}. ${input.reason}`,
          debtorId: previous.debtorId,
          ownerId: previous.ownerId,
          renewedFromId: previous.id,
          createdBy: actor,
        },
      });

      await tx.promissoryNote.update({
        where: { id: previous.id },
        data: { status: 'RENEWED' },
      });

      await this.audit.record(
        {
          actorId: actor,
          actorRole: ctx.actorRole,
          action: 'note.renew',
          targetType: 'PromissoryNote',
          targetId: previous.id,
          metadata: { newNoteId: created.id, newFolio: folio, amountCents: amountCents.toString() },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: 'NoteRenewed',
        occurredAt: now,
        payload: { previousNoteId: previous.id, noteId: created.id, folio },
      });

      return { id: created.id, folio };
    });
  }
}
