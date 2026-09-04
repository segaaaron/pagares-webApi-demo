import { Suspense } from 'react';
import { api } from '@/shared/api/client';
import { SettingsForm, type SettingsValues } from '@/features/settings/settings-form';
import { PasswordForm } from '@/features/settings/password-form';
import { ReminderRulesForm } from '@/features/settings/reminder-rules-form';
import { getReminderRules } from '@/features/settings/reminder-actions';
import { BalanceRow, type Mismatch } from '@/features/settings/balance-row';
import { auditLabel } from '@/features/settings/audit-labels';
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

const ROLES: Record<string, string> = { ADMIN: 'Tú', CLIENT: 'El deudor', SYSTEM: 'El sistema' };

/**
 * Configuración de la organización (§19.8). Es lo que evita teclear los mismos
 * datos en cada pagaré, y donde viven los umbrales que el sistema sólo avisa.
 *
 * Las comprobaciones van en su propio límite de suspensión: recorren la cadena
 * de la bitácora y recalculan el saldo de toda la cartera, y bloquear los
 * formularios detrás de eso dejaba «Guardando…» encendido mucho después de que
 * el guardado ya había terminado.
 */
export default async function SettingsPage() {
  const [values, rules] = await Promise.all([
    api<SettingsValues>('/admin/settings'),
    // Que no se puedan leer las reglas de aviso no debe impedir configurar la
    // organización ni cambiar la contraseña: son tres cosas independientes que
    // sólo comparten pantalla.
    getReminderRules().catch(() => null),
  ]);

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        crumbs={[{ label: 'Ajustes' }]}
        title="Ajustes"
        description="Tres cosas distintas: cómo se emiten los pagarés, cuándo salen los avisos y qué prueba que nada se tocó."
      />

      <Bloque
        titulo="La organización"
        explicacion="Se rellena solo al emitir un pagaré y es lo que se imprime en los documentos."
      >
        <SettingsForm values={values} />
      </Bloque>

      <Bloque
        titulo="Avisos automáticos"
        explicacion="Qué se manda y cuántos días antes o después del vencimiento. Nada sale solo: estas reglas eligen la plantilla cuando decides mandarlo."
      >
        {rules ? (
          <ReminderRulesForm data={rules} />
        ) : (
          <section className="card p-4">
            <p className="text-sm text-muted">
              No se pudieron cargar las reglas de aviso. Vuelve a cargar la página; lo demás de
              esta pantalla sigue funcionando.
            </p>
          </section>
        )}
      </Bloque>

      <Bloque titulo="Tu cuenta" explicacion="Sólo afecta a tu acceso, no al de los demás.">
        <PasswordForm />
      </Bloque>

      <Bloque
        titulo="Comprobaciones"
        explicacion="Aquí se responde si los números que cobras son de fiar. Míralo cuando un saldo no cuadre, cuando alguien reclame un abono que no aparece, o antes de cerrar el mes: en verde no hay nada que hacer."
      >
        <Suspense fallback={<ComprobacionesCargando />}>
          <Comprobaciones />
        </Suspense>
      </Bloque>
    </div>
  );
}

/**
 * Las tres comprobaciones, con sus tres llamadas.
 *
 * Son caras —recorren la bitácora entera y suman el libro de abonos de toda la
 * cartera—, así que van juntas y separadas de lo demás.
 */
async function Comprobaciones() {
  let chain: ChainVerification;
  let balances: BalanceCheck;
  let audit: AuditEntry[];
  try {
    [chain, balances, audit] = await Promise.all([
      api<ChainVerification>('/admin/audit/verify'),
      // La otra comprobación que nadie hace si no está a la vista (§22.5).
      api<BalanceCheck>('/admin/reports/balance-check'),
      // Las últimas del libro: verificar la cadena sin poder leerla contesta
      // "no la tocaron", pero no "quién hizo qué" (§14.5).
      api<AuditEntry[]>('/admin/audit?limit=15'),
    ]);
  } catch {
    // Estas tres recorren la bitácora entera y suman toda la cartera: son las
    // que primero se caen cuando la API va justa. Que no se puedan comprobar no
    // es motivo para tumbar Ajustes y dejar al administrador sin poder guardar
    // nada. Se dice que no se pudo, y el resto de la pantalla sigue en pie.
    return (
      <section className="card p-4">
        <h2 className="text-sm font-semibold">No se pudieron hacer las comprobaciones</h2>
        <p className="mt-1 text-xs text-muted">
          Ni la bitácora ni el cuadre de saldos respondieron. No significa que algo no cuadre:
          significa que no se pudo mirar. Vuelve a cargar la página en un momento.
        </p>
      </section>
    );
  }

  const avisos = audit.filter((entry) => auditLabel(entry.action).tone === 'atencion').length;
  const todoBien = chain.intact && balances.balanced;

  return (
    <>
      {/*
        * El veredicto va primero y en una línea. Antes había que leer dos
        * tarjetas hasta el final para saber si había algo que hacer, y lo
        * primero que se veía era la lista de movimientos, que parece ruido
        * cuando todo está bien.
        */}
      <section
        aria-label="Resultado de las comprobaciones"
        className={`card flex flex-wrap items-center gap-x-4 gap-y-2 p-4 ${
          todoBien ? '' : 'border-crit'
        }`}
      >
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
            todoBien ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'
          }`}
          aria-hidden
        >
          {todoBien ? <NavIcon.check /> : <NavIcon.alert />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {todoBien
              ? 'Los datos están intactos y los saldos cuadran'
              : 'Hay algo que revisar'}
          </p>
          <p className="text-xs text-muted">
            {todoBien
              ? 'Nadie tocó la base por fuera del sistema y cada saldo coincide con la suma de sus abonos. No hay nada que hacer.'
              : [
                  chain.intact ? null : 'la bitácora fue alterada',
                  balances.balanced ? null : 'algún saldo no coincide con sus abonos',
                ]
                  .filter(Boolean)
                  .join(' y ') + '. El detalle está abajo.'}
          </p>
        </div>
        <span className="tnum shrink-0 text-xs text-muted">
          comprobado {dateTime(chain.checkedAt)}
        </span>
      </section>

      <section className="card overflow-hidden" aria-label="Bitácora">
        <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink" aria-hidden>
            <NavIcon.document />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Quién hizo qué</h2>
            <p className="text-xs text-muted">
              Toda acción que toca dinero, accesos o el estado de un pagaré se anota aquí sola, y
              no se puede editar ni borrar. Es lo que contesta «¿quién anuló ese abono?» cuando el
              deudor reclama.
            </p>
          </div>
          {avisos > 0 ? (
            <span className="chip shrink-0 bg-warn-soft text-warn">
              {avisos} para mirar
            </span>
          ) : null}
        </header>

        {audit.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted">Todavía no hay movimientos.</p>
        ) : (
          <ul className="divide-y divide-line">
            {agruparRepetidos(audit).map((grupo) => {
              const label = auditLabel(grupo.entry.action);
              return (
                <li key={grupo.entry.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        label.tone === 'atencion' ? 'bg-warn' : 'bg-line-strong'
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 text-sm text-ink">
                      {label.text}
                      {grupo.veces > 1 ? (
                        // Cuatro avisos iguales seguidos son un hecho, no
                        // cuatro: repetirlos empuja fuera de pantalla lo demás.
                        <span className="ml-2 text-xs text-muted">{grupo.veces} veces</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {ROLES[grupo.entry.actorRole] ?? grupo.entry.actorRole}
                    </span>
                    <span className="tnum shrink-0 text-xs text-muted">
                      {dateTime(grupo.entry.createdAt)}
                      {grupo.veces > 1 ? ` – ${dateTime(grupo.ultima)}` : ''}
                    </span>
                  </div>
                  {label.hint ? (
                    <p className="mt-1 pl-[1.125rem] text-xs text-muted">{label.hint}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* La bitácora encadenada sólo sirve si alguien la comprueba (§24.1). */}
      <section className="card p-4">
        <h2 className="text-sm font-semibold">Nadie tocó la bitácora</h2>
        <p className="mt-1 text-xs text-muted">
          Cada movimiento lleva la huella del anterior encadenada. Si alguien entrara a la base de
          datos a borrar o cambiar una fila —para tapar un abono anulado, por ejemplo—, la cadena
          dejaría de cuadrar y se vería aquí.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
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
        {chain.intact ? null : (
          <p className="mt-3 rounded-lg bg-crit-soft px-3 py-2 text-xs text-crit">
            Alguien modificó la bitácora fuera del sistema. No lo arregles borrando: guarda una
            copia de la base antes de tocar nada.
          </p>
        )}
      </section>

      {/* `paidCents` es una copia del libro de abonos, y una copia se puede
          desviar. Aquí se ve, y no se corrige sola: un descuadre puede ser un
          abono que falta o uno que sobra, y taparlo sería peor (§22.5). */}
      <section className="card p-4" aria-label="Cuadre de saldos">
        <h2 className="text-sm font-semibold">Los saldos cuadran con los abonos</h2>
        <p className="mt-1 text-xs text-muted">
          Cada pagaré guarda su saldo aparte para no sumar el libro entero cada vez que se abre una
          pantalla. Aquí se comprueba que esa copia sigue coincidiendo con la suma real. Si no
          coincide, el saldo que estás cobrando no es el que dice el libro.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
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
    </>
  );
}

/** Mientras se recorren la cadena y el libro, con la forma de lo que viene. */
function ComprobacionesCargando() {
  return (
    <div className="space-y-5 motion-safe:animate-pulse" role="status" aria-label="Comprobando">
      <div className="card overflow-hidden">
        <div className="h-16 border-b border-line bg-surface-2" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
            <div className="h-3 w-52 rounded bg-surface-2" />
            <div className="ml-auto h-3 w-28 rounded bg-surface-2" />
          </div>
        ))}
      </div>
      <div className="card space-y-3 p-4">
        <div className="h-3 w-48 rounded bg-surface-2" />
        <div className="h-3 w-full rounded bg-surface-2" />
        <div className="h-6 w-32 rounded bg-surface-2" />
      </div>
      <div className="card space-y-3 p-4">
        <div className="h-3 w-56 rounded bg-surface-2" />
        <div className="h-3 w-full rounded bg-surface-2" />
        <div className="h-6 w-32 rounded bg-surface-2" />
      </div>
      <span className="sr-only">Comprobando la bitácora y los saldos…</span>
    </div>
  );
}

/**
 * Un grupo de la pantalla, con su título y una línea que dice para qué sirve.
 *
 * Sin esto, Ajustes era una columna de tarjetas donde la configuración de la
 * empresa, las reglas de aviso, la contraseña propia y la verificación de la
 * bitácora pesaban lo mismo y parecían lo mismo.
 */
function Bloque({
  titulo,
  explicacion,
  children,
}: {
  titulo: string;
  explicacion: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-ink">{titulo}</h2>
        <p className="mt-0.5 max-w-prose text-sm text-muted">{explicacion}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Junta los movimientos iguales y seguidos.
 *
 * Cuatro «se reutilizó un token de sesión» del mismo sistema en un minuto son
 * **un** hecho contado cuatro veces, y ocupan el sitio de lo que sí hay que
 * mirar. Se agrupan sólo si son consecutivos: si entre medias pasó otra cosa,
 * el orden importa y no se toca.
 */
function agruparRepetidos(
  entradas: AuditEntry[],
): { entry: AuditEntry; veces: number; ultima: string }[] {
  const grupos: { entry: AuditEntry; veces: number; ultima: string }[] = [];

  for (const entrada of entradas) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.entry.action === entrada.action && ultimo.entry.actorRole === entrada.actorRole) {
      ultimo.veces += 1;
      // La lista va de lo nuevo a lo viejo: la última del grupo es la más
      // antigua, y con las dos se ve el rango.
      ultimo.ultima = entrada.createdAt;
      continue;
    }
    grupos.push({ entry: entrada, veces: 1, ultima: entrada.createdAt });
  }

  return grupos;
}
