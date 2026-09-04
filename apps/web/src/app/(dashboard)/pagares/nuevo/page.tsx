import { IssueForm } from '@/features/notes/issue-form';
import { getNote } from '@/features/notes/detail-queries';
import { getDebtor } from '@/features/debtors/queries';
import { getSettings } from '@/features/settings/queries';
import { todayInBusinessZone } from '@/shared/lib/today';
import { PageHeader } from '@/shared/ui/page-header';
import { fromAnnualRatePct } from '@pagares/domain-rules';

export const metadata = { title: 'Emitir pagaré' };

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const consulta = await searchParams;
  const duplicarDe = typeof consulta['duplicar'] === 'string' ? consulta['duplicar'] : null;
  // Desde la ficha de un deudor: llega elegido, sin importe ni observaciones.
  const deudorDe = typeof consulta['deudor'] === 'string' ? consulta['deudor'] : null;

  const [settings, origen, deudor] = await Promise.all([
    getSettings(),
    duplicarDe ? getNote(duplicarDe) : Promise.resolve(null),
    deudorDe ? getDebtor(deudorDe) : Promise.resolve(null),
  ]);
  const today = todayInBusinessZone();

  const due = new Date(`${today}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + settings.defaultTermDays);

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        crumbs={[{ label: 'Pagarés', href: '/pagares' }, { label: 'Emitir' }]}
        title="Emitir pagaré"
        description={
          origen
            ? `Copia de ${origen.folio}. Importe y deudor vienen puestos; revisa fechas y monto antes de emitir.`
            : 'El folio, el importe en letra y el enlace de consulta los genera el sistema.'
        }
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
        plantilla={
          deudor
            ? {
                debtor: {
                  id: deudor.id,
                  fullName: deudor.fullName,
                  phone: deudor.phone,
                  email: deudor.email,
                  address: deudor.address,
                  activeCount: 0,
                  overdueCount: 0,
                  behavior: '',
                },
                ...(deudor.lastGuarantors?.length
                  ? { guarantors: deudor.lastGuarantors }
                  : {}),
              }
            : origen
            ? {
                debtor: {
                  id: origen.debtor.id,
                  fullName: origen.debtor.fullName,
                  phone: origen.debtor.phone,
                  email: origen.debtor.email,
                  address: origen.debtor.address,
                  activeCount: 0,
                  overdueCount: 0,
                  // El comportamiento lo calcula la ficha del deudor; aquí sólo
                  // hace falta su identidad para no volver a buscarlo.
                  behavior: '',
                },
                // El importe se copia en pesos, que es como se teclea.
                amount: (Number(origen.amount.cents) / 100).toFixed(2),
                observations: origen.observations ?? undefined,
              }
            : undefined
        }
      />
    </div>
  );
}
