import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { BaseDomainError } from '@pagares/api-core';
import { ERROR_CODES, type ProblemDetails } from '@pagares/contracts';
import type { Request, Response } from 'express';
import type { ZodIssue } from 'zod';

const PROBLEM_BASE = 'https://api.pagares.mx/errors';

/**
 * Traducción única de error a respuesta (§25.5). El dominio lanza `BaseDomainError`
 * y sólo aquí se decide el código HTTP: así ninguna regla de negocio conoce HTTP.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { traceId?: string }>();
    const response = ctx.getResponse<Response>();
    const traceId = request.traceId ?? 'unknown';

    const problem = this.toProblem(exception, request.url, traceId);

    // 5xx se registra completo; 4xx es conversación normal con el cliente.
    if (problem.status >= 500) {
      this.logger.error({ traceId, url: request.url, exception });
    }

    response
      .status(problem.status)
      .setHeader('Content-Type', 'application/problem+json')
      .json(problem);
  }

  /**
   * Detección por forma y no con `instanceof`.
   *
   * La API compila a CommonJS y `@pagares/contracts` es ESM, así que cada una
   * carga una entrada distinta del mismo paquete zod. Son dos clases `ZodError`
   * diferentes para el motor, y `instanceof` falla: el error de validación se
   * escapaba como 500 en vez de 422.
   */
  private isZodError(error: unknown): error is { issues: ZodIssue[] } {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'ZodError' &&
      Array.isArray((error as { issues?: unknown }).issues)
    );
  }

  private toProblem(exception: unknown, instance: string, traceId: string): ProblemDetails {
    if (this.isZodError(exception)) {
      return {
        type: `${PROBLEM_BASE}/validation`,
        title: 'La solicitud contiene campos inválidos',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: 'Revisa los campos marcados.',
        instance,
        traceId,
        errors: exception.issues.map((issue) => ({
          field: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      };
    }

    if (exception instanceof BaseDomainError) {
      return {
        type: `${PROBLEM_BASE}/${exception.code}`,
        title: exception.message,
        status: exception.httpStatus,
        instance,
        traceId,
        ...(exception.field !== undefined
          ? { errors: [{ field: exception.field, code: exception.code, message: exception.message }] }
          : {}),
      };
    }

    if (exception instanceof HttpException) {
      return {
        type: `${PROBLEM_BASE}/http`,
        title: exception.message,
        status: exception.getStatus(),
        instance,
        traceId,
      };
    }

    // Nada de detalles internos hacia fuera: el traceId permite encontrarlo en el log.
    return {
      type: `${PROBLEM_BASE}/${ERROR_CODES.SERVICE_UNAVAILABLE}`,
      title: 'Ocurrió un error inesperado',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: `Comparte este identificador con soporte: ${traceId}`,
      instance,
      traceId,
    };
  }
}
