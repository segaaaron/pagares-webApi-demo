'use server';

import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/shared/api/client';

export interface SettingsState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

const num = (form: FormData, key: string): number => Number(String(form.get(key) ?? '0'));

/** "1,500.50" → "150050" en centavos, sin pasar por coma flotante. */
const toCents = (value: string): string => {
  // Se queda con dígitos y punto: un signo o una letra colada no debe viajar al
  // servidor para volver como un error de validación que el usuario no entiende.
  const cleaned = value.replace(/[^\d.]/g, '');
  if (cleaned === '') return '0';
  const [pesos = '0', centavos = ''] = cleaned.split('.');
  return (
    BigInt(pesos || '0') * 100n +
    BigInt(centavos.padEnd(2, '0').slice(0, 2) || '0')
  ).toString();
};
const str = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();
const nullable = (form: FormData, key: string): string | null => str(form, key) || null;

/**
 * Guarda la configuración de la organización (§19.8).
 *
 * La tasa por defecto distingue vacío de cero: vacío es "sin intereses pactados",
 * cero es "pactados en cero" (§12.3).
 */
export async function saveSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const rate = str(formData, 'defaultInterestRateAnnualPct');

  try {
    await api('/admin/settings', {
      method: 'PUT',
      body: {
        legalName: str(formData, 'legalName'),
        address: str(formData, 'address'),
        phone: nullable(formData, 'phone'),
        email: nullable(formData, 'email'),
        defaultIssuePlace: str(formData, 'defaultIssuePlace'),
        defaultPaymentPlace: str(formData, 'defaultPaymentPlace'),
        defaultTermDays: num(formData, 'defaultTermDays'),
        defaultInterestRateAnnualPct: rate === '' ? null : Number(rate),
        defaultInterestPeriod:
          str(formData, 'defaultInterestPeriod') === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
        interestBasis: num(formData, 'interestBasis'),
        interestWarningThresholdPct: num(formData, 'interestWarningThresholdPct'),
        applyPaymentToInterestFirst: formData.get('applyPaymentToInterestFirst') === 'on',
        lateInterestOverPrincipalOnly: formData.get('lateInterestOverPrincipalOnly') === 'on',
        prescriptionYears: num(formData, 'prescriptionYears'),
        issueNonNegotiable: formData.get('issueNonNegotiable') === 'on',
        // En centavos hacia el servidor: el formulario habla en pesos porque es
        // como se piensa un importe, pero el dinero nunca viaja en coma flotante.
        settlementToleranceCents: toCents(str(formData, 'settlementTolerance')),
        bankName: nullable(formData, 'bankName'),
        bankAccount: nullable(formData, 'bankAccount'),
        bankClabe: nullable(formData, 'bankClabe'),
        paymentReference: nullable(formData, 'paymentReference'),
      },
    });
    revalidatePath('/ajustes');
    revalidatePath('/pagares/nuevo');
    return { ok: 'Ajustes guardados.' };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        error: error.problem?.title ?? 'No se pudieron guardar los ajustes.',
        fieldErrors: error.fieldErrors(),
      };
    }
    throw error;
  }
}
