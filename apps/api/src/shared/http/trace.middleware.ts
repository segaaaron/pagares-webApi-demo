import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Identificador de traza único por petición (§22.3). Viaja al log, a la respuesta
 * de error y al worker: cuando algo falla, se encuentra en segundos.
 */
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Request & { traceId?: string }, res: Response, next: NextFunction): void {
    const incoming = req.header('x-trace-id');
    const traceId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    req.traceId = traceId;
    res.setHeader('x-trace-id', traceId);
    next();
  }
}
