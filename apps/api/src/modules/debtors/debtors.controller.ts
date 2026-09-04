import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { CLOCK, type Clock } from '@pagares/api-core';
import { businessToday, daysOverdue, formatMxn } from '@pagares/domain-rules';
import { Roles } from '../../shared/http/auth.guard.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';
import { withClock } from '../promissory-notes/domain/note-status.js';

const OPEN: readonly string[] = ['ISSUED', 'PARTIALLY_PAID', 'RESTRUCTURED'];

/**
 * Deudores con su cartera (§19.8).
 *
 * El comportamiento de pago se **deriva del historial**, no se teclea: un campo
 * manual envejece y termina mintiendo.
 */
@Controller({ path: 'admin/debtors', version: '1' })
@Roles('ADMIN')
export class DebtorsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Directorio de deudores. Con `q` sirve además al buscador de la emisión
   * (§19.6: "elige o crea al deudor"): sin él, cada pagaré nuevo del mismo
   * cliente crearía otro deudor y su historial quedaría partido en dos.
   */
  @Get()
  async list(@Query('q') q?: string) {
    const term = q?.trim();
    const debtors = await this.prisma.debtor.findMany({
      where: term
        ? {
            OR: [
              { fullName: { contains: term, mode: 'insensitive' } },
              { phone: { contains: term } },
              { email: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {},
      ...(term ? { take: 20 } : {}),
      orderBy: { fullName: 'asc' },
      include: {
        promissoryNotes: {
          select: { amountCents: true, paidCents: true, status: true, dueDate: true },
        },
      },
    });

    // Vencido se compara contra hoy en la zona del negocio, no en UTC (§12.1).
    const today = new Date(`${businessToday(this.clock.now())}T00:00:00Z`);
    return debtors.map((d) => {
      let balance = 0n;
      let overdueCount = 0;
      let activeCount = 0;
      let settledCount = 0;

      for (const note of d.promissoryNotes) {
        if (note.status === 'PAID') settledCount += 1;
        if (OPEN.includes(note.status)) {
          activeCount += 1;
          balance += note.amountCents - note.paidCents;
          if (note.dueDate < today) overdueCount += 1;
        }
      }

      return {
        id: d.id,
        fullName: d.fullName,
        phone: d.phone,
        email: d.email,
        address: d.address,
        hasAccount: d.userId !== null,
        balance: formatMxn(balance),
        balanceCents: balance.toString(),
        activeCount,
        overdueCount,
        settledCount,
        // Puntual, con atrasos o moroso: se calcula, no se captura.
        behavior: overdueCount === 0 ? 'puntual' : overdueCount > 1 ? 'moroso' : 'con atrasos',
      };
    });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const now = this.clock.now();
    const debtor = await this.prisma.debtor.findUnique({
      where: { id },
      include: {
        promissoryNotes: {
          orderBy: { dueDate: 'asc' },
          include: { guarantors: { orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!debtor) throw new NotFoundException();

    return {
      id: debtor.id,
      fullName: debtor.fullName,
      address: debtor.address,
      phone: debtor.phone,
      email: debtor.email,
      hasAccount: debtor.userId !== null,
      /**
       * Los avales del pagaré más reciente (§19.6).
       *
       * Quien avala a alguien suele avalarlo otra vez: son el padre, el socio o
       * la esposa, y volver a teclear sus tres campos en cada emisión es
       * trabajo que el sistema ya tiene hecho. Llegan como sugerencia editable,
       * no como obligación: el aval del pagaré nuevo puede ser otro.
       */
      lastGuarantors: (debtor.promissoryNotes.at(-1)?.guarantors ?? []).map((g) => ({
        position: g.position,
        fullName: g.fullName,
        address: g.address,
        phone: g.phone,
      })),
      notes: debtor.promissoryNotes.map((n) => ({
        id: n.id,
        folio: n.folio,
        status: withClock(n.status, daysOverdue(n.dueDate.toISOString().slice(0, 10), now)),
        amount: formatMxn(n.amountCents),
        balance: formatMxn(n.amountCents - n.paidCents),
        dueDate: n.dueDate.toISOString().slice(0, 10),
      })),
    };
  }
}
