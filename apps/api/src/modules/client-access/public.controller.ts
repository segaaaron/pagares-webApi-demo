import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { CLOCK, type Clock } from '@pagares/api-core';
import { daysOverdue, formatMxn } from '@pagares/domain-rules';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../shared/http/auth.guard.js';
import { PUBLIC_THROTTLE } from '../../shared/http/throttler.config.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';
import { withClock } from '../promissory-notes/domain/note-status.js';

/**
 * Consulta pública por token (§15).
 *
 * Sin login, pero **sin datos personales**: la proyección omite domicilio,
 * teléfono y correo en la propia consulta, no en el render. El token es de 128
 * bits, así que es consultable pero no enumerable.
 */
@Controller({ path: 'public/notes', version: '1' })
export class PublicNotesController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Public()
  @Throttle(PUBLIC_THROTTLE)
  @Get(':token')
  async byToken(@Param('token') token: string) {
    const note = await this.prisma.promissoryNote.findUnique({
      where: { publicToken: token },
      select: {
        folio: true,
        status: true,
        amountCents: true,
        paidCents: true,
        amountInWords: true,
        issueDate: true,
        dueDate: true,
        issuePlace: true,
        paymentPlace: true,
        creditorName: true,
        debtor: { select: { fullName: true } },
      },
    });
    if (!note) throw new NotFoundException('El documento no existe');

    return {
      folio: note.folio,
      status: withClock(note.status, daysOverdue(note.dueDate.toISOString().slice(0, 10), this.clock.now())),
      amount: formatMxn(note.amountCents),
      balance: formatMxn(note.amountCents - note.paidCents),
      amountInWords: note.amountInWords,
      issueDate: note.issueDate.toISOString().slice(0, 10),
      dueDate: note.dueDate.toISOString().slice(0, 10),
      issuePlace: note.issuePlace,
      paymentPlace: note.paymentPlace,
      creditorName: note.creditorName,
      debtorName: note.debtor.fullName,
    };
  }
}
