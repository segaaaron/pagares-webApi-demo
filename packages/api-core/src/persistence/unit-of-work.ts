import type { DomainEvent } from '../messaging/domain-event.js';

/**
 * Unidad de trabajo (§3.3, §12.2).
 *
 * `client` es el cliente **de la transacción en curso**, y es obligatorio usarlo:
 * si un caso de uso escribe con el cliente normal dentro de `run`, esas consultas
 * salen fuera de la transacción. El bloqueo de fila se libera al instante y dos
 * operaciones simultáneas pueden pisarse — se pierde una actualización de saldo
 * sin ningún error visible.
 *
 * El tipo del cliente queda como parámetro para que este paquete no dependa de
 * Prisma: el dominio no conoce el ORM.
 */
export interface TransactionScope<TClient = unknown> {
  readonly client: TClient;
  /** Escribe un evento en el outbox, dentro de esta misma transacción. */
  publish(event: DomainEvent): void;
}

export interface UnitOfWork<TClient = unknown> {
  run<T>(work: (scope: TransactionScope<TClient>) => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UnitOfWork');
