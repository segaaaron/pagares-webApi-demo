import { Logger } from '@nestjs/common';
import type { UseCaseLogger } from '@pagares/api-core';

/**
 * Adaptador entre el logger de Nest y el puerto que usa `BaseUseCase`.
 * Existe para que `api-core` no dependa de NestJS: la clase base es del dominio
 * de aplicación, no del framework.
 */
export class NestUseCaseLogger implements UseCaseLogger {
  private readonly logger: Logger;

  constructor(context: string) {
    this.logger = new Logger(context);
  }

  trace(entry: Record<string, unknown>): void {
    this.logger.debug(entry);
  }

  error(entry: Record<string, unknown>): void {
    this.logger.error(entry);
  }
}
