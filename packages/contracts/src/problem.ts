import { z } from 'zod';
import type { ErrorCode } from './errors.js';

/** Formato único de error: RFC 9457 (§25.5). */
export const fieldErrorSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
});

export const problemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  traceId: z.string(),
  errors: z.array(fieldErrorSchema).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
export type FieldError = { field: string; code: ErrorCode; message: string };
