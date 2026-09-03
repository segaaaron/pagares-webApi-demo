import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Límite de tasa por **usuario** en la ráfaga, y por IP en el sostenido (§25.7).
 *
 * Contar sólo por IP se rompe con el cliente real de este sistema: los deudores
 * entran desde el móvil, y las operadoras meten a miles de abonados detrás de la
 * misma dirección (CGNAT). Con cien usuarios compartiendo IP, la ráfaga de 120
 * por minuto se agota entre ellos y la aplicación empieza a devolver 429 a gente
 * que no ha hecho nada raro. Lo mismo pasa con varios administradores en una
 * oficina: una sola IP para todos.
 *
 * Por eso la ventana corta se cuenta por usuario cuando la petición viene
 * autenticada. **La ventana larga sigue siendo por IP**, y ahí está la defensa:
 * quien fabrique identificadores falsos para estrenar cubo se topa igualmente
 * con el límite sostenido de su dirección.
 *
 * El identificador se lee del token **sin verificar la firma** a propósito: aquí
 * sólo sirve para elegir un cubo, y verificarlo obligaría a hacer criptografía
 * antes del límite de tasa, que es justo lo que el límite existe para evitar. La
 * petición la sigue autenticando el guard de §9.1 un paso después.
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected override generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    if (name !== 'short') return super.generateKey(context, suffix, name);

    const request = context.switchToHttp().getRequest<{ header?: (n: string) => string | undefined }>();
    const subject = subjectOf(request.header?.('authorization'));

    return subject
      ? super.generateKey(context, `u:${subject}`, name)
      : super.generateKey(context, suffix, name);
  }
}

/** El `sub` del JWT, leído del cuerpo del token sin comprobar su firma. */
function subjectOf(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;

  const payload = header.slice(7).split('.')[1];
  if (!payload) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown;
    };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    // Un token ilegible no es un usuario: que cuente por IP, como los anónimos.
    return null;
  }
}
