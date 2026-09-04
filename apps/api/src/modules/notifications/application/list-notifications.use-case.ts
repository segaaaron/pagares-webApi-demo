import { Injectable } from '@nestjs/common';
import { BaseUseCase } from '@pagares/api-core';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { outboxState, recipientOf, type OutboxState } from '../domain/outbox-state.js';
import { diagnoseFailure, type FailureDiagnosis } from '../domain/delivery-failure.js';

export interface NotificationRow {
  id: string;
  eventType: string;
  state: OutboxState;
  attempts: number;
  createdAt: string;
  publishedAt: string | null;
  /** A quién iba. Se resuelve contra la base cuando el evento no lo lleva. */
  recipient: string | null;
  /** Nombre de quien debía recibirlo: un correo suelto no dice quién es. */
  recipientName: string | null;
  /** Folio del pagaré del aviso, cuando va de uno. */
  folio: string | null;
  /** Qué pasó, en castellano, y qué hacer. */
  failure: FailureDiagnosis;
  /** El error del proveedor tal cual: la pista para quien lo investigue. */
  lastError: string | null;
}

export interface FailureGroup {
  code: string;
  title: string;
  action: string;
  count: number;
  retryHelps: boolean;
}

export interface NotificationsView {
  /** Lo que nadie va a reintentar solo. Es la cifra que hay que mirar. */
  stuck: NotificationRow[];
  /** Aún tiene intentos: saldrá con la siguiente operación. */
  pending: NotificationRow[];
  counts: { stuck: number; pending: number };
  /**
   * Los motivos agrupados, del que más avisos afecta al que menos.
   *
   * Cinco filas con el mismo error son **un** problema, no cinco. Sin esto, el
   * panel obliga a leer cinco veces lo mismo para darse cuenta.
   */
  causes: FailureGroup[];
}

/** Un fallo repetido cuenta lo mismo que uno nuevo; con cincuenta se ve el patrón. */
const LIMIT = 50;

interface Destinatario {
  email: string | null;
  name: string | null;
  folio: string | null;
}

/**
 * Avisos que no han salido (§18.1).
 *
 * El envío ocurre al cerrar cada operación, así que un correo caído no
 * interrumpe nada y por eso mismo puede pasar desapercibido durante horas. Esta
 * vista existe para que no pase, y para que quien la abre sepa **a quién** no le
 * llegó y **por qué**, sin traducir del inglés ni entrar a la base de datos.
 */
@Injectable()
export class ListNotificationsUseCase extends BaseUseCase<Record<string, never>, NotificationsView> {
  constructor(private readonly prisma: PrismaService) {
    super(new NestUseCaseLogger(ListNotificationsUseCase.name));
  }

  protected async handle(): Promise<NotificationsView> {
    const rows = await this.prisma.outboxMessage.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
    });

    const destinatarios = await this.resolverDestinatarios(rows);

    const stuck: NotificationRow[] = [];
    const pending: NotificationRow[] = [];

    for (const row of rows) {
      const resuelto = destinatarios.get(row.id);
      const view: NotificationRow = {
        id: row.id,
        eventType: row.eventType,
        state: outboxState(row),
        attempts: row.attempts,
        createdAt: row.createdAt.toISOString(),
        publishedAt: row.publishedAt?.toISOString() ?? null,
        recipient: recipientOf(row.payload) ?? resuelto?.email ?? null,
        recipientName: resuelto?.name ?? null,
        folio: resuelto?.folio ?? null,
        failure: diagnoseFailure(row.lastError),
        lastError: row.lastError,
      };
      if (view.state === 'stuck') stuck.push(view);
      else pending.push(view);
    }

    return {
      stuck,
      pending,
      counts: { stuck: stuck.length, pending: pending.length },
      causes: agruparPorCausa([...stuck, ...pending]),
    };
  }

  /**
   * A quién iba cada aviso.
   *
   * Muchos eventos llevan sólo el identificador del usuario o del pagaré porque
   * el correo se resuelve al enviarlo. En el panel eso salía como «destinatario
   * en el evento», que no le sirve a nadie. Se resuelve aquí, y en dos consultas
   * para todas las filas en vez de una por fila.
   */
  private async resolverDestinatarios(
    rows: { id: string; payload: unknown }[],
  ): Promise<Map<string, Destinatario>> {
    const porUsuario = new Map<string, string[]>();
    const porPagare = new Map<string, string[]>();

    for (const row of rows) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const userId = typeof payload['userId'] === 'string' ? payload['userId'] : null;
      const noteId = typeof payload['noteId'] === 'string' ? payload['noteId'] : null;
      if (userId) porUsuario.set(userId, [...(porUsuario.get(userId) ?? []), row.id]);
      else if (noteId) porPagare.set(noteId, [...(porPagare.get(noteId) ?? []), row.id]);
    }

    const resultado = new Map<string, Destinatario>();

    if (porUsuario.size > 0) {
      const usuarios = await this.prisma.user.findMany({
        where: { id: { in: [...porUsuario.keys()] } },
        select: { id: true, email: true, fullName: true },
      });
      for (const usuario of usuarios) {
        for (const outboxId of porUsuario.get(usuario.id) ?? []) {
          resultado.set(outboxId, { email: usuario.email, name: usuario.fullName, folio: null });
        }
      }
    }

    if (porPagare.size > 0) {
      const notes = await this.prisma.promissoryNote.findMany({
        where: { id: { in: [...porPagare.keys()] } },
        select: {
          id: true,
          folio: true,
          debtor: { select: { fullName: true, email: true } },
          owner: { select: { email: true } },
        },
      });
      for (const note of notes) {
        for (const outboxId of porPagare.get(note.id) ?? []) {
          resultado.set(outboxId, {
            // El mismo orden que usa el envío: manda el correo del deudor y el
            // de su cuenta es el respaldo (§25.12).
            email: note.debtor.email ?? note.owner?.email ?? null,
            name: note.debtor.fullName,
            folio: note.folio,
          });
        }
      }
    }

    return resultado;
  }
}

function agruparPorCausa(rows: NotificationRow[]): FailureGroup[] {
  const porCausa = new Map<string, FailureGroup>();

  for (const row of rows) {
    const { code, title, action, detail, retryHelps } = row.failure;
    // El dato concreto entra en la clave: dos dominios sin verificar son dos
    // problemas distintos aunque compartan el código.
    const clave = `${code}:${detail ?? ''}`;
    const existente = porCausa.get(clave);
    if (existente) existente.count += 1;
    else {
      porCausa.set(clave, {
        code,
        title: detail ? `${title}: ${detail}` : title,
        action,
        count: 1,
        retryHelps,
      });
    }
  }

  return [...porCausa.values()].sort((a, b) => b.count - a.count);
}
