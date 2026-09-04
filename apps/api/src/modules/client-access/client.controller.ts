import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { accrueInterest, businessToday, daysOverdue, formatMxn, money } from '@pagares/domain-rules';
import { CLOCK, type Clock } from '@pagares/api-core';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../media/domain/ports/object-storage.js';
import { NOTE_DOCUMENTS, type NoteDocuments } from '../../shared/domain/note-documents.port.js';
import { withClock } from '../promissory-notes/domain/note-status.js';

const OPEN = ['ISSUED', 'PARTIALLY_PAID', 'RESTRUCTURED'] as const;

/**
 * Lo que ve el cliente en la app (§0).
 *
 * **Todo es de sólo lectura**: la única escritura del cliente es firmar. Y todo
 * filtra por `ownerId`, que es la defensa contra ver el pagaré de otro (§9.1, API1).
 */
@Controller({ path: 'me', version: '1' })
@Roles('CLIENT', 'ADMIN')
export class ClientController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(NOTE_DOCUMENTS) private readonly documents: NoteDocuments,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Sus propios datos, los que el acreedor registró (§25.2).
   *
   * El deudor los tiene delante en el pagaré impreso, así que no hay nada que
   * ocultarle; lo que no puede es cambiarlos desde la aplicación, porque el
   * documento ya se firmó con ellos. La app los enseña bloqueados y dice quién
   * los registró.
   */
  @Get('profile')
  async profile(@CurrentActor() actor: Actor) {
    const debtor = await this.prisma.debtor.findFirst({
      where: { userId: actor.id },
      select: { fullName: true, address: true, phone: true, email: true },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { fullName: true, email: true },
    });

    return {
      fullName: debtor?.fullName ?? user.fullName,
      // Nulos y no ausentes: la cuenta puede existir sin ficha de deudor —un
      // administrador entrando por aquí—, y la app tiene que poder decirlo.
      address: debtor?.address ?? null,
      phone: debtor?.phone ?? null,
      email: debtor?.email ?? user.email,
      /** Los datos vienen de la ficha que llevó el acreedor, no de la cuenta. */
      registeredByCreditor: debtor !== null,
    };
  }

  /** "Cuánto debo": la pregunta que abre la app. */
  @Get('summary')
  async summary(@CurrentActor() actor: Actor) {
    const now = this.clock.now();
    const notes = await this.prisma.promissoryNote.findMany({
      where: { ownerId: actor.id, status: { in: [...OPEN] } },
      select: { amountCents: true, paidCents: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    });

    let balance = 0n;
    for (const n of notes) balance += n.amountCents - n.paidCents;

    const pendingSignature = await this.prisma.promissoryNote.count({
      where: { ownerId: actor.id, status: 'PENDING_SIGNATURE' },
    });

    const next = notes[0];
    return {
      totalBalance: money(balance),
      activeNotes: notes.length,
      pendingSignature,
      nextDueDate: next?.dueDate.toISOString().slice(0, 10) ?? null,
      nextDueInDays: next
        ? Math.round(
            (next.dueDate.getTime() - Date.parse(`${businessToday(now)}T00:00:00Z`)) / 86_400_000,
          )
        : null,
    };
  }

  /**
   * Abonos de un pagaré del cliente.
   *
   * El detalle ya los trae, pero la app los pagina aparte cuando son muchos, y
   * el desglose entre interés y capital sólo tiene sentido verlo aquí: es la
   * respuesta a "abonué 5 000 y el saldo bajó 3 800" (§12.3).
   */
  @Get('notes/:id/payments')
  async payments(@Param('id') id: string, @CurrentActor() actor: Actor) {
    // El filtro por dueño va en la consulta del pagaré, no en un `if` posterior.
    const note = await this.prisma.promissoryNote.findFirst({
      where: { id, ownerId: actor.id },
      select: { id: true, folio: true },
    });
    if (!note) throw new NotFoundException();

    const payments = await this.prisma.payment.findMany({
      where: { noteId: note.id },
      orderBy: { paidOn: 'desc' },
    });

    return payments.map((payment) => ({
      id: payment.id,
      // Cada importe lleva el número y el texto en el mismo objeto (§12.1): una
      // sola forma de dinero en toda la API, la misma que usa el listado de
      // administración.
      amount: money(payment.amountCents),
      appliedToInterest: money(payment.appliedToInterestCents),
      appliedToPrincipal: money(payment.appliedToPrincipalCents),
      paidOn: payment.paidOn.toISOString().slice(0, 10),
      method: payment.method,
      reference: payment.reference,
      /**
       * Una reversa lleva importe negativo y la fila original no se toca (§12.2).
       * Lo que la define es apuntar al abono que revierte, no el signo: el signo
       * dejaría de bastar el día que exista un ajuste negativo de otra clase.
       */
      isReversal: payment.reversalOfId !== null,
      /** Abono sobre un pagaré ya dado de baja contable: recuperación (§12.4). */
      isRecovery: payment.isRecovery,
      /**
       * Condonación del remanente (§25.16). Se enseña como lo que es: si el
       * deudor ve un abono que no coincide con lo que transfirió y nadie se lo
       * explica, la conclusión razonable es que hay un error.
       */
      isWaiver: payment.isWaiver,
    }));
  }

  /**
   * Documentos del cliente: su pagaré, sus recibos y su estado de cuenta.
   *
   * Se sirve el PDF, no una URL del almacenamiento: los documentos se generan al
   * momento (§17.1) y una URL prefirmada de algo que no existe todavía no lleva
   * a ninguna parte.
   */
  @Get('notes/:id/documents/:type')
  async document(
    @Param('id') id: string,
    @Param('type') type: string,
    @Query('paymentId') paymentId: string | undefined,
    @CurrentActor() actor: Actor,
    @Res() response: Response,
  ): Promise<void> {
    const note = await this.prisma.promissoryNote.findFirst({
      where: { id, ownerId: actor.id },
      select: { id: true, folio: true, debtorId: true, status: true },
    });
    if (!note) throw new NotFoundException();

    const document = await this.documentFor(type, note, paymentId);

    response
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `inline; filename="${document.filename}"`)
      .send(document.content);
  }

  private async documentFor(
    type: string,
    note: { id: string; debtorId: string; status: string },
    paymentId: string | undefined,
  ): Promise<{ filename: string; content: Buffer }> {
    if (type === 'note') return this.documents.note(note.id);
    if (type === 'statement') return this.documents.statement(note.debtorId);
    if (type === 'release') {
      if (note.status !== 'PAID') {
        // Un finiquito de algo no liquidado certificaría una falsedad.
        throw new NotFoundException('El pagaré no está liquidado');
      }
      return this.documents.release(note.id);
    }
    if (type === 'receipt') {
      // El abono va en la query y no dentro del tipo: `receipt:<id>` metía dos
      // datos en un mismo segmento de ruta y obligaba a escaparlo en el cliente.
      if (!paymentId) throw new BadRequestException('Falta el abono del recibo');
      const payment = await this.prisma.payment.findFirst({
        // El abono tiene que ser de **este** pagaré, o el recibo sería de otro.
        where: { id: paymentId, noteId: note.id },
        select: { id: true },
      });
      if (!payment) throw new NotFoundException('El abono no existe en este pagaré');
      return this.documents.receipt(payment.id);
    }
    throw new BadRequestException('Tipo de documento no reconocido');
  }

  /**
   * Actividad del cliente: qué ha pasado con sus pagarés, en una sola línea de
   * tiempo. Contesta "¿ya registraron mi pago?" sin que tenga que abrir cada
   * pagaré uno por uno.
   */
  @Get('activity')
  async activity(@CurrentActor() actor: Actor, @Req() request: Request) {
    const limit = Math.min(Number((request.query['limit'] as string) ?? 50) || 50, 100);

    const notes = await this.prisma.promissoryNote.findMany({
      where: { ownerId: actor.id },
      select: {
        id: true,
        folio: true,
        createdAt: true,
        acceptedAt: true,
        updatedAt: true,
        status: true,
        // El importe acompaña al movimiento en la línea de tiempo.
        amountCents: true,
      },
    });
    const byId = new Map(notes.map((note) => [note.id, note]));

    const payments = await this.prisma.payment.findMany({
      where: { noteId: { in: notes.map((note) => note.id) } },
      orderBy: { paidOn: 'desc' },
      take: limit,
    });

    /*
     * El importe va como dato además de dentro de `detail`: la aplicación lo
     * pinta alineado a la derecha de la fila, y sacarlo de la frase con una
     * expresión regular es exactamente el tipo de acuerdo que se rompe en
     * cuanto alguien mejora la redacción.
     */
    const events: {
      at: string;
      kind: string;
      folio: string;
      detail: string;
      amount: ReturnType<typeof money> | null;
    }[] = [];

    for (const note of notes) {
      events.push({
        at: note.createdAt.toISOString(),
        kind: 'note-issued',
        folio: note.folio,
        detail: 'Pagaré emitido',
        amount: money(note.amountCents),
      });
      if (note.acceptedAt) {
        events.push({
          at: note.acceptedAt.toISOString(),
          kind: 'note-signed',
          folio: note.folio,
          detail: 'Pagaré firmado',
          // Firmar no mueve dinero: el importe iría de adorno.
          amount: null,
        });
      }
      if (note.status === 'PAID') {
        events.push({
          // La liquidación se fecha cuando ocurrió, no cuando se emitió: con
          // `createdAt` la línea de tiempo decía que se pagó antes de firmarse.
          at: note.updatedAt.toISOString(),
          kind: 'note-settled',
          folio: note.folio,
          detail: 'Pagaré liquidado',
          amount: money(note.amountCents),
        });
      }
    }

    for (const payment of payments) {
      // El signo dice cómo se pinta el importe; la relación dice qué ES la fila.
      const esReversa = payment.reversalOfId !== null;
      events.push({
        at: payment.paidOn.toISOString(),
        kind: esReversa ? 'payment-reversed' : 'payment-registered',
        folio: byId.get(payment.noteId)?.folio ?? '',
        detail: esReversa
          ? `Abono anulado por ${formatMxn(-payment.amountCents)}`
          : `Abono de ${formatMxn(payment.amountCents)}`,
        // La reversa llega en negativo, como en el libro (§12.2): el signo es
        // parte del dato y no algo que la aplicación tenga que deducir.
        amount: money(payment.amountCents),
      });
    }

    return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }

  @Get('notes')
  async notes(@CurrentActor() actor: Actor) {
    const now = this.clock.now();
    const rows = await this.prisma.promissoryNote.findMany({
      where: { ownerId: actor.id },
      orderBy: { dueDate: 'asc' },
      select: {
        id: true,
        folio: true,
        status: true,
        amountCents: true,
        paidCents: true,
        dueDate: true,
        creditorName: true,
      },
    });

    return rows.map((r) => {
      const dueDate = r.dueDate.toISOString().slice(0, 10);
      const balance = r.amountCents - r.paidCents;
      const overdue = daysOverdue(dueDate, now);
      return {
        id: r.id,
        folio: r.folio,
        status: withClock(r.status, overdue),
        creditorName: r.creditorName,
        amount: money(r.amountCents),
        paid: money(r.paidCents),
        balance: money(balance),
        dueDate,
        daysOverdue: overdue,
      };
    });
  }

  @Get('notes/:id')
  async note(@Param('id') id: string, @CurrentActor() actor: Actor) {
    const now = this.clock.now();
    const note = await this.prisma.promissoryNote.findFirst({
      // El filtro por dueño va en la consulta, no en un `if` posterior.
      where: { id, ownerId: actor.id },
      include: {
        debtor: true,
        signature: true,
        payments: { orderBy: { paidOn: 'desc' } },
        // Quién más quedó obligado. Va en el documento que el deudor firma, así
        // que ocultárselo era pedirle que firmara sin verlo entero (§25.15).
        guarantors: { orderBy: { position: 'asc' } },
      },
    });
    if (!note) throw new NotFoundException();

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const dueDate = note.dueDate.toISOString().slice(0, 10);
    const overdue = daysOverdue(dueDate, now);
    const balance = note.amountCents - note.paidCents;

    return {
      id: note.id,
      folio: note.folio,
      status: withClock(note.status, overdue),
      creditorName: note.creditorName,
      amount: money(note.amountCents),
      paid: money(note.paidCents),
      balance: money(balance),
      amountInWords: note.amountInWords,
      accruedInterest: money(
        accrueInterest({
          balanceCents: balance,
          annualRatePct: note.interestRateAnnualPct === null ? null : Number(note.interestRateAnnualPct),
          daysOverdue: overdue,
          basis: (settings?.interestBasis ?? 360) as 360 | 365,
        }),
      ),
      issueDate: note.issueDate.toISOString().slice(0, 10),
      dueDate,
      daysOverdue: overdue,
      paymentPlace: note.paymentPlace,
      /*
       * Del aval, sólo quién es. No se manda estado de firma porque el sistema
       * no puede capturarla: prometerla en la aplicación era enseñar un paso
       * que nunca llega. El domicilio y el teléfono están en el papel, pero son
       * datos de un tercero y aquí no añaden nada (§9.1).
       */
      guarantors: note.guarantors.map((guarantor) => ({
        position: guarantor.position,
        fullName: guarantor.fullName,
      })),
      signatureUrl: note.signature ? await this.storage.signedUrl(note.signature.assetId) : null,
      payments: note.payments.map((p) => ({
        // El identificador va aquí porque el recibo se pide por abono: sin él,
        // el detalle enseñaba una lista de la que no se podía descargar nada.
        id: p.id,
        amount: money(p.amountCents),
        // El reparto va aquí y no sólo en la lista aparte: sin él, un abono que
        // se consumió entero en interés deja al deudor mirando un capital que no
        // se movió, y concluyendo que su dinero no llegó.
        appliedToInterest: money(p.appliedToInterestCents),
        appliedToPrincipal: money(p.appliedToPrincipalCents),
        paidOn: p.paidOn.toISOString().slice(0, 10),
        method: p.method,
        // Las mismas banderas que en el libro: un array donde la anulación llega
        // en negativo y sin etiqueta es una trampa para quien lo lea después.
        isReversal: p.reversalOfId !== null,
        isRecovery: p.isRecovery,
        isWaiver: p.isWaiver,
      })),
      /**
       * Cómo se reparte un abono en esta casa (§12.3).
       *
       * Lo decide el administrador en Ajustes y cambia lo que el deudor debe
       * entender: con el interés primero, un abono pequeño no baja el capital.
       * Sin este dato, la aplicación sólo puede escribir una frase ambigua.
       */
      applyPaymentToInterestFirst: settings?.applyPaymentToInterestFirst ?? true,
      // Datos para pagar, desde Ajustes (§25.12).
      paymentInstructions: settings
        ? {
            bankName: settings.bankName,
            bankAccount: settings.bankAccount,
            bankClabe: settings.bankClabe,
            reference: settings.paymentReference,
          }
        : null,
    };
  }
}
