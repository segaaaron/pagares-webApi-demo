import type { ErrorCode } from '@pagares/contracts';

/**
 * Todo error del dominio hereda de aquí (§5). El dominio nunca lanza HttpException:
 * el filtro global traduce este error al formato RFC 9457.
 */
export abstract class BaseDomainError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: number;
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = new.target.name;
    if (field !== undefined) this.field = field;
  }
}
