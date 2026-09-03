/**
 * Evento de dominio (§3.3). Nombre en pasado: describe un hecho consumado.
 * Se escribe en el outbox dentro de la misma transacción que el cambio.
 */
export interface DomainEvent<TPayload = Record<string, unknown>> {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

/** Puerto del outbox. La implementación escribe en la transacción en curso. */
export interface EventOutbox {
  enqueue(event: DomainEvent): Promise<void>;
}

export const EVENT_OUTBOX = Symbol('EventOutbox');

/**
 * Acumula los eventos de un caso de uso y los vuelca al outbox.
 * Vaciarlo es responsabilidad de BaseUseCase, dentro de la transacción.
 */
export class EventCollector {
  private readonly pending: DomainEvent[] = [];

  add(event: DomainEvent): void {
    this.pending.push(event);
  }

  drain(): DomainEvent[] {
    return this.pending.splice(0, this.pending.length);
  }
}
