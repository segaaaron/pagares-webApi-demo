import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Valida el cuerpo contra el schema de `packages/contracts`.
 * El schema es `.strict()`, así que un campo de más es 422: es lo que impide el
 * mass assignment de `role`, `status`, `ownerId` o `folio` (§9.1, API3).
 * El `ZodError` lo traduce el filtro global; aquí no se toca HTTP.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
