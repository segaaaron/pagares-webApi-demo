/**
 * Cuenta de acceso del deudor, vista desde la emisión (§25.2).
 *
 * `Debtor` es quien debe; `User` es su acceso a la aplicación. Son cosas
 * distintas y la relación es opcional —hay deudores sin correo que firman
 * presencialmente—, pero cuando hay correo la cuenta tiene que quedar creada y
 * enlazada **en la misma transacción** que el pagaré: si se creara después y
 * fallara, existiría un pagaré que su dueño no puede ver ni firmar.
 *
 * El módulo de pagarés no sabe hashear contraseñas ni mandar credenciales; sólo
 * pide "asegúrame la cuenta de este correo". Lo implementa el módulo de
 * usuarios, que es de quien es esa responsabilidad (§3.2).
 */
export interface ClientAccountProvisioner {
  ensureForEmail(input: {
    /** Cliente de la transacción en curso; la cuenta va en el mismo commit. */
    tx: unknown;
    /** Para publicar `UserCreated` en el mismo outbox que el pagaré. */
    publish: (event: {
      eventId: string;
      eventType: string;
      occurredAt: Date;
      payload: Record<string, unknown>;
    }) => void;
    email: string;
    fullName: string;
    phone?: string | undefined;
    actorId: string | undefined;
  }): Promise<{ userId: string; created: boolean }>;
}

export const CLIENT_ACCOUNT_PROVISIONER = Symbol('ClientAccountProvisioner');
