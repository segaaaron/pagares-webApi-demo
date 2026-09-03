/**
 * Puerto de credenciales (§3.2). Otros módulos dependen de esta interfaz, nunca
 * del servicio concreto: cambiar argon2 por otra cosa no debe tocar `auth` ni `users`.
 */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
  /** Trabajo señuelo para respuestas en tiempo constante (§10.4). */
  wasteTime(): Promise<void>;
  generateTemporary(length?: number): string;
  generateOtp(): string;
  hashOtp(code: string): string;
  verifyOtp(storedHash: string, code: string): boolean;
}

export const PASSWORD_HASHER = Symbol('PasswordHasher');
