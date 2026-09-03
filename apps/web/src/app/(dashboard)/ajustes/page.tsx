import { api } from '@/shared/api/client';
import { SettingsForm, type SettingsValues } from '@/features/settings/settings-form';
import { PasswordForm } from '@/features/settings/password-form';
import { ReminderRulesForm } from '@/features/settings/reminder-rules-form';
import { getReminderRules } from '@/features/settings/reminder-actions';
import { BalanceRow, type Mismatch } from '@/features/settings/balance-row';
import { dateTime } from '@/shared/lib/format';
import { PageHeader } from '@/shared/ui/page-header';
import { NavIcon } from '@/shared/ui/icons/nav-icons';

interface AuditEntry {
  id: string;
  action: string;
  actorRole: string;
  targetType: string;
  createdAt: string;
  metadata: unknown;
}

interface BalanceCheck {
  checkedAt: string;
  balanced: boolean;
  mismatches: Mismatch[];
}

interface ChainVerification {
  entries: number;
  intact: boolean;
  brokenAt: number | null;
  checkedAt: string;
}

export const metadata = { title: 'Ajustes' };

const ROLES: Record<string, string> = { ADMIN: 'Administrador', CLIENT: 'Cliente', SYSTEM: 'Sistema' };

/**
 * Configuración de la organización (§19.8). Es lo que evita teclear los mismos
 * datos en cada pagaré, y donde viven los umbrales que el sistema sólo avisa.
 */
export default async function SettingsPage() {
  const [values, rules, chain, balances, audit] = await Promise.all([
    api<SettingsValues>('/admin/settings'),
    getReminderRules(),
    api<ChainVerification>('/admin/audit/verify'),
    // La otra comprobación que nadie hace si no está a la vista (§22.5).
    api<BalanceCheck>('/admin/reports/balance-check'),
    // Las últimas del libro: verificar la cadena sin poder leerla contesta
    // "no la tocaron", pero no "quién hizo qué" (§14.5).
    api<AuditEntry[]>('/admin/audit?limit=15'),
  ]);

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        crumbs={[{ label: 'Ajustes' }]}
        title="Ajustes"
        description="Estos valores se rellenan solos al emitir un pagaré y aparecen en los documentos."
      />

      <SettingsForm values={values} />

      <ReminderRulesForm data={rules} />

      <PasswordForm />

      <section className="card overflow-hidden" aria-label="Bitácora">
        <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink" aria-hidden>
            <NavIcon.document />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Bitácora</h2>
            <p className="text-xs text-muted">
              Los últimos {audit.length} movimientos: quién hizo qué y cuándo.
            </p>
          </div>
        </header>

        {audit.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted">Todavía no hay movimientos.</p>
        ) : (
          <ul className="divide-y divide-line">
            {audit.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="chip bg-surface-2 font-mono text-[11px] text-ink-2">{entry.action}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{entry.targetType}</span>
                <span className="shrink-0 text-xs text-muted">{ROLES[entry.actorRole] ?? entry.actorRole}</span>
                <span className="tnum shrink-0 text-xs text-muted">{dateTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* La bitácora encadenada sólo sirve si alguien la comprueba (§24.1). */}
      <section className="card p-4">
        <h2 className="text-sm font-semibold">Integridad de la bitácora</h2>
        <p className="mt-1 text-xs text-muted">
          Cada registro incorpora el hash del anterior. Si alguien altera o borra una fila
          directamente en la base, la cadena deja de cuadrar.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span
            className={`inline-flex rounded px-2 py-1 text-xs font-medium ${
              chain.intact ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'
            }`}
          >
            {chain.intact ? 'Cadena íntegra' : `Alterada en el registro ${chain.brokenAt ?? '?'}`}
          </span>
          <span className="tnum text-xs text-muted">
            {chain.entries} {chain.entries === 1 ? 'registro' : 'registros'} · comprobado{' '}
            {dateTime(chain.checkedAt)}
          </span>
        </div>
      </section>

      {/* `paidCents` es una copia del libro de abonos, y una copia se puede
          desviar. Aquí se ve, y no se corrige sola: un descuadre puede ser un
          abono que falta o uno que sobra, y taparlo sería peor (§22.5). */}
      <section className="card p-4" aria-label="Cuadre de saldos">
        <h2 className="text-sm font-semibold">Cuadre de saldos</h2>
        <p className="mt-1 text-xs text-muted">
          El saldo de cada pagaré tiene que ser la suma de sus abonos. La verdad son las filas del
          libro; si no cuadran, aquí salen.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span
            className={`inline-flex rounded px-2 py-1 text-xs font-medium ${
              balances.balanced ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'
            }`}
          >
            {balances.balanced
              ? 'Todo cuadra'
              : `${balances.mismatches.length} ${
                  balances.mismatches.length === 1 ? 'pagaré descuadrado' : 'pagarés descuadrados'
                }`}
          </span>
          <span className="tnum text-xs text-muted">comprobado {dateTime(balances.checkedAt)}</span>
        </div>

        {balances.balanced ? null : (
          <>
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {balances.mismatches.slice(0, 10).map((row) => (
                <BalanceRow key={row.id} row={row} />
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Recalcular ajusta el saldo del pagaré a la suma de su libro de abonos; el libro no
              se toca. Si el saldo sube, es que falta asentar un abono: eso se arregla
              registrándolo, no aquí.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
