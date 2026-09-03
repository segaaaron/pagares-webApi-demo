import 'server-only';
import { api } from '@/shared/api/client';

export interface PortfolioReport {
  asOf: string;
  totals: {
    outstandingFormatted: string;
    overdueFormatted: string;
    nonPerformingFormatted: string;
    collectedThisMonthFormatted: string;
    activeNotes: number;
    overdueNotes: number;
    dueSoonNotes: number;
    dueSoonFormatted: string;
  };
  aging: { bucket: string; label: string; count: number; balanceCents: string; balanceFormatted: string }[];
  flow: {
    month: string;
    label: string;
    collectedCents: string;
    issuedCents: string;
    collectedFormatted: string;
    issuedFormatted: string;
  }[];
  mix: {
    key: string;
    label: string;
    count: number;
    balanceCents: string;
    balanceFormatted: string;
  }[];
}

export async function getPortfolio(): Promise<PortfolioReport> {
  return api<PortfolioReport>('/admin/reports/portfolio');
}

export interface OperationalReport {
  title: string;
  range: { from: string; to: string };
  summary: { label: string; value: string; detail?: string }[];
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string>[];
}

/**
 * Un reporte operativo por su nombre (§17.2). Cobranza los usa para sus
 * indicadores: el dato ya está calculado en el servidor y volver a sumarlo en
 * el front sería tener dos verdades.
 */
export async function getOperationalReport(
  slug: string,
  range?: { from: string; to: string },
): Promise<OperationalReport> {
  const query = new URLSearchParams();
  if (range) {
    query.set('from', range.from);
    query.set('to', range.to);
  }
  return api<OperationalReport>(`/admin/reports/${slug}?${query.toString()}`);
}

/** Busca una cifra del resumen por su etiqueta; si no está, devuelve el vacío. */
export function summaryValue(report: OperationalReport, label: string): string {
  return report.summary.find((row) => row.label === label)?.value ?? '—';
}
