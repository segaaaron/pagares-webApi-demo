import { Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { businessToday, formatMxn } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';

export interface QueueItem {
  noteId: string;
  folio: string;
  debtorName: string;
  debtorPhone: string;
  balance: string;
  dueDate: string;
  daysOverdue: number;
  detail?: string;
}

export interface WorkQueues {
  dueToday: QueueItem[];
  brokenPromises: QueueItem[];
  unattended: QueueItem[];
  pendingSignature: QueueItem[];
  noChannel: QueueItem[];
  prescribing: QueueItem[];
  /** Ya pasó el plazo del art. 165 y nadie demandó: cobrable sólo de buena fe. */
  prescribed: QueueItem[];
}

const DAY_MS = 86_400_000;
const UNATTENDED_DAYS = 7;
const PRESCRIPTION_ALERTS_DAYS = 180;

/**
 * Bandeja de trabajo (§19.2).
 *
 * Es la pantalla principal porque responde "qué hago ahora", no "cómo va todo".
 * Cada cola existe para eliminar una búsqueda manual: sin ellas, el administrador
 * filtra la tabla a mano cada mañana.
 */
@Injectable()
export class WorkQueueUseCase extends BaseUseCase<Record<string, never>, WorkQueues> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(WorkQueueUseCase.name));
  }

  protected async handle(_input: Record<string, never>, _ctx: ExecutionContext): Promise<WorkQueues> {
    const now = this.clock.now();
    const today = businessToday(now);
    const todayDate = new Date(`${today}T00:00:00Z`);

    const open = await this.prisma.promissoryNote.findMany({
      where: { status: { in: ['ISSUED', 'PARTIALLY_PAID', 'RESTRUCTURED', 'PENDING_SIGNATURE'] } },
      include: {
        debtor: true,
        activities: { orderBy: { createdAt: 'desc' }, take: 1 },
        // Demandar interrumpe la prescripción (art. 1041 C.Com.): mientras el
        // expediente siga abierto, el reloj del art. 165 no corre.
        legalCase: { select: { closedOn: true } },
        payments: { orderBy: { paidOn: 'desc' }, take: 1 },
      },
      orderBy: { dueDate: 'asc' },
    });

    const promises = await this.prisma.collectionActivity.findMany({
      where: { outcome: 'PROMISED', promiseKept: null, promisedOn: { lt: todayDate } },
      include: { note: { include: { debtor: true } } },
      orderBy: { promisedOn: 'asc' },
    });

    const queues: WorkQueues = {
      dueToday: [],
      brokenPromises: [],
      unattended: [],
      pendingSignature: [],
      noChannel: [],
      prescribing: [],
      prescribed: [],
    };

    const toItem = (note: (typeof open)[number], detail?: string): QueueItem => {
      const dueDate = note.dueDate.toISOString().slice(0, 10);
      return {
        noteId: note.id,
        folio: note.folio,
        debtorName: note.debtor.fullName,
        debtorPhone: note.debtor.phone,
        balance: formatMxn(note.amountCents - note.paidCents),
        dueDate,
        daysOverdue: Math.max(0, Math.round((todayDate.getTime() - note.dueDate.getTime()) / DAY_MS)),
        ...(detail !== undefined ? { detail } : {}),
      };
    };

    for (const note of open) {
      const dueDate = note.dueDate.toISOString().slice(0, 10);
      const overdue = Math.round((todayDate.getTime() - note.dueDate.getTime()) / DAY_MS);
      const balance = note.amountCents - note.paidCents;

      if (note.status === 'PENDING_SIGNATURE') {
        // 48 h sin firmar: probablemente no vio el correo.
        if (now.getTime() - note.createdAt.getTime() > 2 * DAY_MS) {
          queues.pendingSignature.push(toItem(note, 'Enviado hace más de 48 h'));
        }
        continue;
      }

      if (dueDate === today && balance > 0n) queues.dueToday.push(toItem(note));

      if (overdue > 0 && balance > 0n) {
        const lastActivity = note.activities[0]?.createdAt;
        const idle = !lastActivity || now.getTime() - lastActivity.getTime() > UNATTENDED_DAYS * DAY_MS;
        if (idle) {
          queues.unattended.push(
            toItem(note, lastActivity ? 'Sin gestión en 7 días' : 'Nunca se ha gestionado'),
          );
        }
        // Sin correo no hay aviso automático: requiere gestión manual (§25.12).
        if (!note.debtor.email) {
          queues.noChannel.push(toItem(note, 'Sin correo: avísale por WhatsApp o teléfono'));
        }
      }

      // Un expediente abierto interrumpe el plazo: seguir avisando de un pagaré
      // ya demandado manda al administrador a apagar un fuego que no existe, y
      // esconde los que sí corren peligro entre el ruido.
      const interrumpido = note.legalCase !== null && note.legalCase.closedOn === null;

      if (note.prescribesOn && balance > 0n && !interrumpido) {
        const daysLeft = Math.round((note.prescribesOn.getTime() - todayDate.getTime()) / DAY_MS);
        if (daysLeft < 0) {
          // Prescrito no es incobrable: el deudor puede pagar, y muchos pagan.
          // Lo que ya no se puede es demandar, y eso cambia cómo se gestiona.
          queues.prescribed.push(
            toItem(note, `Prescribió hace ${Math.abs(daysLeft)} días: ya no es exigible en juicio`),
          );
        } else if (daysLeft <= PRESCRIPTION_ALERTS_DAYS) {
          queues.prescribing.push(toItem(note, `Prescribe en ${daysLeft} días`));
        }
      }
    }

    for (const promise of promises) {
      const note = promise.note;
      const paidAfter = await this.prisma.payment.count({
        where: { noteId: note.id, createdAt: { gt: promise.createdAt } },
      });
      if (paidAfter > 0) continue;

      queues.brokenPromises.push({
        noteId: note.id,
        folio: note.folio,
        debtorName: note.debtor.fullName,
        debtorPhone: note.debtor.phone,
        balance: formatMxn(note.amountCents - note.paidCents),
        dueDate: note.dueDate.toISOString().slice(0, 10),
        daysOverdue: Math.max(0, Math.round((todayDate.getTime() - note.dueDate.getTime()) / DAY_MS)),
        detail: `Prometió pagar el ${promise.promisedOn?.toISOString().slice(0, 10) ?? '—'}`,
      });
    }

    return queues;
  }
}
