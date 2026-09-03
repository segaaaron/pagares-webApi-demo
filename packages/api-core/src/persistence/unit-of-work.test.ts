import { describe, expect, it } from 'vitest';
import type { TransactionScope, UnitOfWork } from './unit-of-work.js';

/**
 * Regresión de un fallo real: los casos de uso escribían con el cliente normal
 * dentro de `run`, así que las consultas salían fuera de la transacción. El
 * bloqueo de fila se soltaba al instante y dos abonos simultáneos se pisaban el
 * saldo — se perdía una actualización sin ningún error visible.
 *
 * El contrato que impide repetirlo: `run` entrega el cliente de la transacción y
 * es el único que debe usarse dentro.
 */
describe('unidad de trabajo', () => {
  it('entrega a la operación el cliente de la transacción', async () => {
    const txClient = { marca: 'transaccion' };
    const uow: UnitOfWork<typeof txClient> = {
      run: async (work) => work({ client: txClient, publish: () => undefined }),
    };

    const recibido = await uow.run(async (scope) => scope.client);
    expect(recibido).toBe(txClient);
  });

  it('acumula los eventos publicados durante la operación', async () => {
    const publicados: string[] = [];
    const uow: UnitOfWork<unknown> = {
      run: async (work) =>
        work({
          client: {},
          publish: (event) => publicados.push(event.eventType),
        } satisfies TransactionScope<unknown>),
    };

    await uow.run(async (scope) => {
      scope.publish({ eventId: '1', eventType: 'PaymentRegistered', occurredAt: new Date(0), payload: {} });
      scope.publish({ eventId: '2', eventType: 'NoteSettled', occurredAt: new Date(0), payload: {} });
    });

    expect(publicados).toEqual(['PaymentRegistered', 'NoteSettled']);
  });
});
