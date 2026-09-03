import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from '../domain/ports/password-hasher.js';

/** Parámetros de §9.1, API2. */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65_536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

/** Alfabeto sin caracteres ambiguos: se dicta por teléfono sin confusiones. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

@Injectable()
export class PasswordService implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain).catch(() => false);
  }

  /**
   * Verificación señuelo para respuestas en tiempo constante (§10.4).
   * Se ejecuta cuando el correo no existe: sin esto, el tiempo de respuesta
   * revela qué cuentas son válidas.
   */
  async wasteTime(): Promise<void> {
    await argon2.hash('tiempo-constante', ARGON2_OPTIONS);
  }

  /** Contraseña temporal de 16 caracteres, criptográficamente aleatoria. */
  generateTemporary(length = 16): string {
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += ALPHABET[randomInt(ALPHABET.length)];
    }
    return out;
  }

  /** Código OTP de 6 dígitos. Se guarda hasheado, nunca en claro (§10.2). */
  generateOtp(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  hashOtp(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /** Comparación en tiempo constante: comparar con `===` filtra información. */
  verifyOtp(storedHash: string, code: string): boolean {
    const candidate = Buffer.from(this.hashOtp(code));
    const stored = Buffer.from(storedHash);
    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  }
}
