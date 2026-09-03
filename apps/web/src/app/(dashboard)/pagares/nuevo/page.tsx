import { IssueForm } from '@/features/notes/issue-form';
import { getSettings } from '@/features/settings/queries';
import { todayInBusinessZone } from '@/shared/lib/today';
import { PageHeader } from '@/shared/ui/page-header';
import { fromAnnualRatePct } from '@pagares/domain-rules';

export const metadata = { title: 'Emitir pagaré' };

export default async function NewNotePage() {
  const settings = await getSettings();
  const today = todayInBusinessZone();

  const due = new Date(`${today}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + settings.defaultTermDays);

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        crumbs={[{ label: 'Pagarés', href: '/pagares' }, { label: 'Emitir' }]}
        title="Emitir pagaré"
        description="El folio, el importe en letra y el enlace de consulta los genera el sistema."
      />

      <IssueForm
        defaults={{
          creditorName: settings.legalName,
          issuePlace: settings.defaultIssuePlace,
          paymentPlace: settings.defaultPaymentPlace,
          // El valor por defecto se guarda en anual; el formulario lo enseña en
          // la periodicidad que use la casa.
          interestRate:
            settings.defaultInterestRateAnnualPct === null
              ? ''
              : String(
                  Number(
                    fromAnnualRatePct(
                      Number(settings.defaultInterestRateAnnualPct),
                      settings.defaultInterestPeriod,
                    ).toFixed(4),
                  ),
                ),
          interestPeriod: settings.defaultInterestPeriod,
          interestWarningThresholdPct: Number(settings.interestWarningThresholdPct),
          today,
          defaultDueDate: due.toISOString().slice(0, 10),
        }}
      />
    </div>
  );
}
