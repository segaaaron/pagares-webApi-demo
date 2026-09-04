/**
 * Los estados por los que se filtra la cartera.
 *
 * Viven aparte de `queries.ts` porque esa pieza es sólo de servidor y el filtro
 * es un control del cliente: importarla desde allí arrastraría todo el módulo
 * de consultas al navegador.
 */
export const TABS = [
  { id: 'todos', label: 'Todos' },
  { id: 'por-firmar', label: 'Por firmar' },
  { id: 'vigentes', label: 'Vigentes' },
  { id: 'por-vencer', label: 'Por vencer' },
  { id: 'vencidos', label: 'Vencidos' },
  { id: 'cartera-vencida', label: 'Cartera vencida' },
  { id: 'en-convenio', label: 'En convenio' },
  { id: 'pagados', label: 'Pagados' },
  { id: 'castigados', label: 'Baja contable' },
  { id: 'anulados', label: 'Anulados' },
] as const;

export type TabId = (typeof TABS)[number]['id'];
