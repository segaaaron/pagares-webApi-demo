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
}

export async function getSettings(): Promise<OrganizationSettings> {
  return api<OrganizationSettings>('/admin/settings');
}
