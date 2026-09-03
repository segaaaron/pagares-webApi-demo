import { z } from 'zod';

/**
 * Contrato único de paginación por cursor (§25.4).
 * El cursor es opaco: base64url de { campo de orden, id }. El cliente no lo construye.
 */
/** 15 filas: lo que cabe en pantalla sin bajar, en la cartera y en el resto. */
export const DEFAULT_PAGE_LIMIT = 15;
export const MAX_PAGE_LIMIT = 100;

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  cursor: z.string().min(1).optional(),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export interface PageInfo {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface Paginated<T> {
  data: T[];
  page: PageInfo;
}
