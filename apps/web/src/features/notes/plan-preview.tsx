'use client';

import { buildPaymentPlan, installmentDates, toAnnualRatePct, type PlanModel } from '@pagares/domain-rules';
import { money, shortDate } from '@/shared/lib/format';
import { NavIcon } from '@/shared/ui/icons/nav-icons';

/**
 * El plan de pagos, antes de emitirlo.
 *
 * Es la pieza que convierte «12 pagos al 3 %» en algo que se puede pactar con
 * el deudor delante: cuánto paga cada mes, cuánto de eso es interés, y cuánto
 * gana quien presta. Se calcula con **la misma función que usará el servidor**
 * al emitir —vive en `domain-rules`—, así que lo que se enseña aquí es
 * exactamente lo que se va a firmar, no una aproximación de la pantalla.
 */
export interface PlanPreviewProps {
  amount: string;
  installments: number;
  model: PlanModel;
  rate: string;
  period: 'MONTHLY' | 'ANNUAL';
  firstDueDate: string;
}

export function PlanPreview({
  amount,
  installments,
  model,
  rate,
  period,
  firstDueDate,
}: PlanPreviewProps) {
  const centavos = Math.round(Number(amount.replace(/[^\d.]/g, '')) * 100);
  if (!Number.isFinite(centavos) || centavos <= 0 || installments < 2) return null;

  const anual = rate === '' ? null : toAnnualRatePct(Number(rate), period);

  let plan;
  try {
    plan = buildPaymentPlan({
      principalCents: BigInt(centavos),
      annualRatePct: model === 'NONE' ? null : anual,
      installments,
      model,
    });
  } catch {
    // Importe que no da ni un centavo por cuota, plazo fuera de rango: el
    // formulario ya lo dirá con su mensaje; aquí simplemente no hay tabla.
    return null;
  }

  const fechas = installmentDates(firstDueDate, installments);
  const conInteres = plan.totalInterestCents > 0n;

  return (
    <section aria-label="Plan de pagos" className="mt-4 rounded-lg border border-line bg-surface">
      {/* Las tres cifras que se pactan de viva voz, antes que la tabla. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-line p-4 sm:grid-cols-4">
        <Cifra etiqueta="Prestas" valor={money(plan.principalCents.toString())} />
        <Cifra
          etiqueta="Cuota mensual"
          valor={money(plan.rows[0]!.paymentCents.toString())}
          destacada
        />
        <Cifra
          etiqueta="Ganas"
          valor={money(plan.totalInterestCents.toString())}
          tono={conInteres ? 'ok' : undefined}
        />
        <Cifra etiqueta="Te devuelven" valor={money(plan.totalCents.toString())} />
      </dl>

      {model === 'GLOBAL' ? (
        <p className="flex items-start gap-2 border-b border-line bg-warn-soft px-4 py-2.5 text-xs text-warn">
          {/* El aviso no se fía sólo del color: lleva icono y texto. */}
          <span aria-hidden className="mt-0.5 shrink-0">
            <NavIcon.alert />
          </span>
          <span>
            Sobre saldo global el interés se calcula siempre sobre los{' '}
            {money(plan.principalCents.toString())} originales, aunque el deudor ya haya pagado la
            mitad. Con la misma tasa, Banxico documenta que el costo real puede casi duplicarse
            frente a saldos insolutos. Es legal y se usa; que sea una decisión y no un descuido.
          </span>
        </p>
      ) : null}

      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Calendario de pagos: {installments} cuotas mensuales desde {shortDate(firstDueDate)}
          </caption>
          <thead className="sticky top-0 bg-surface-2 text-left">
            <tr className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              <th scope="col" className="px-4 py-2 font-medium">
                Pago
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Vence
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Cuota
              </th>
              {conInteres ? (
                <>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Interés
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Capital
                  </th>
                </>
              ) : null}
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Le queda
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {plan.rows.map((fila, indice) => (
              <tr key={fila.index}>
                <td className="tnum px-4 py-1.5 text-xs text-muted">{fila.index}</td>
                <td className="tnum px-4 py-1.5 text-xs text-ink-2">
                  {shortDate(fechas[indice] ?? firstDueDate)}
                </td>
                <td className="tnum px-4 py-1.5 text-right font-medium text-ink">
                  {money(fila.paymentCents.toString())}
                </td>
                {conInteres ? (
                  <>
                    <td className="tnum px-4 py-1.5 text-right text-xs text-warn">
                      {money(fila.interestCents.toString())}
                    </td>
                    <td className="tnum px-4 py-1.5 text-right text-xs text-ink-2">
                      {money(fila.principalCents.toString())}
                    </td>
                  </>
                ) : null}
                <td className="tnum px-4 py-1.5 text-right text-xs text-muted">
                  {money(fila.balanceCents.toString())}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
        Se emitirán <strong className="text-ink">{installments} pagarés</strong>, uno por cuota, con
        estas fechas e importes. El interés moratorio de arriba es aparte: sólo corre sobre la cuota
        que se pague tarde.
      </p>
    </section>
  );
}

function Cifra({
  etiqueta,
  valor,
  destacada = false,
  tono,
}: {
  etiqueta: string;
  valor: string;
  destacada?: boolean;
  tono?: 'ok' | undefined;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{etiqueta}</dt>
      <dd
        className={`tnum mt-0.5 ${destacada ? 'text-lg font-semibold' : 'text-sm'} ${
          tono === 'ok' ? 'text-ok' : 'text-ink'
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}
