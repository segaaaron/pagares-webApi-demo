import type { ExecutionContext } from './execution-context.js';
import { BaseDomainError } from '../domain-error.js';

export interface UseCaseLogger {
  trace(entry: Record<string, unknown>): void;
  error(entry: Record<string, unknown>): void;
}

/**
 * Cuerpo base de todo caso de uso (§5).
 * Da gratis: traza, medición, normalización de errores y el hook de autorización
 * de negocio. La subclase sólo implementa `handle`.
 *
 * Si una subclase necesita anular `execute` en vez de completarlo, la base está
 * mal y se corrige la base.
 */
export abstract class BaseUseCase<TInput, TOutput> {
  protected constructor(protected readonly logger: UseCaseLogger) {}

  /** La operación en sí. Lanza `BaseDomainError`, nunca `HttpException`. */
  protected abstract handle(input: TInput, ctx: ExecutionContext): Promise<TOutput>;

  /** Autorización que depende del negocio, no sólo del rol (§9.1, API5). */
  protected authorize?(input: TInput, ctx: ExecutionContext): Promise<void>;

  async execute(input: TInput, ctx: ExecutionContext): Promise<TOutput> {
    const startedAt = performance.now();
    const useCase = this.constructor.name;
    try {
      if (this.authorize) await this.authorize(input, ctx);
      const output = await this.handle(input, ctx);
      this.logger.trace({ useCase, traceId: ctx.traceId, ms: performance.now() - startedAt });
      return output;
    } catch (error) {
      this.logger.error({
        useCase,
        traceId: ctx.traceId,
        ms: performance.now() - startedAt,
        code: error instanceof BaseDomainError ? error.code : 'unhandled',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
