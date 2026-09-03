/** Contexto que acompaña a toda operación: quién la pide y con qué traza. */
export interface ExecutionContext {
  readonly traceId: string;
  readonly actorId: string | null;
  readonly actorRole: 'ADMIN' | 'CLIENT' | 'SYSTEM';
  readonly ip?: string;
  readonly userAgent?: string;
}

export const SYSTEM_CONTEXT = (traceId: string): ExecutionContext => ({
  traceId,
  actorId: null,
  actorRole: 'SYSTEM',
});
