import 'server-only';
import { api } from '@/shared/api/client';

export interface OrganizationSettings {
  legalName: string;
  defaultIssuePlace: string;
  defaultPaymentPlace: string;
  defaultTermDays: number;
  defaultInterestRateAnnualPct: string | null;
  defaultInterestPeriod: 'MONTHLY' | 'ANNUAL';
  interestBasis: number;
  interestWarningThresholdPct: string;
  prescriptionYears: number;
  bankName: string | null;
  bankAccount: string | null;
  bankClabe: string | null;
  paymentReference: string | null;
  /** Hasta cuánto se puede condonar para cerrar un pagaré (§25.16). */
  settlementToleranceCents: string;
}

export async function getSettings(): Promise<OrganizationSettings> {
  return api<OrganizationSettings>('/admin/settings');
}

/**
 * Sólo la tolerancia, para decidir si el detalle de un pagaré ofrece cerrarlo.
 *
 * Va con su propia captura: que no se puedan leer los ajustes no debe tumbar el
 * detalle. Sin tolerancia legible, la oferta no aparece, que es el lado seguro.
 */
export async function getSettlementToleranceCents(): Promise<string> {
  try {
    const settings = await api<{ settlementToleranceCents?: string }>('/admin/settings');
    return settings.settlementToleranceCents ?? '0';
  } catch {
    return '0';
  }
}
