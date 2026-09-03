export type OtpPurposeName = 'PASSWORD_CHANGE' | 'PASSWORD_RESET';

/**
 * Puerto del OTP (§3.2). `credentials` y `auth` dependen de esta interfaz, no del
 * servicio concreto: dónde se guarda el código y cómo se compara es asunto del
 * adaptador.
 *
 * `consume` **lanza** si el código no es válido; no devuelve `false`. Un booleano
 * invitaría a ignorarlo con un `if` olvidado.
 */
export interface OtpIssuer {
  issue(userId: string, purpose: OtpPurposeName, tx?: unknown): Promise<string>;
  consume(userId: string, purpose: OtpPurposeName, code: string, tx?: unknown): Promise<void>;
}

export const OTP_ISSUER = Symbol('OtpIssuer');
