import Link from 'next/link';
import type { ReactNode } from 'react';
import type { QueueItem } from './queries';
import { shortDate } from '@/shared/lib/format';
import { Money } from '@/shared/ui/money';
import { NavIcon } from '@/shared/ui/icons/nav-icons';

/**
 * Cola de trabajo. **Una sola** para todo el dashboard: la bandeja del panel y
 * las listas de cobranza son la misma cosa.
 *
 * Dos decisiones que cambian cómo se lee:
 *
 *  · La fila lleva **inicial del deudor**, no un icono repetido. En una lista
 *    de personas, lo que distingue una fila de otra es la persona.
 *  · Las acciones son **icono + texto** y la fila entera abre el pagaré. El
 *    contacto —WhatsApp, teléfono— gana el color; "Abrir" se queda de apoyo,
 *    porque es lo que ya hace el clic en la fila.
 */
export function QueueSection({
  id,
  title,
  hint,
  emptyLabel,
  items,
  organizationName,
  icon,
  tone = 'neutral',
}: {
  id: string;
  title: string;
  hint?: string;
  emptyLabel: string;
  items: QueueItem[];
  organizationName: string;
  icon?: ReactNode;
  tone?: QueueTone;
}) {
  const styles = TONES[tone];

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="card card-accent overflow-hidden"
      style={{ '--accent-stripe': styles.stripe } as React.CSSProperties}
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        {icon ? (
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${styles.pill}`} aria-hidden>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="text-sm font-semibold">
            {title}
          </h2>
          {hint ? <p className="truncate text-xs text-muted">{hint}</p> : null}
        </div>
        <span className={`chip ${items.length > 0 ? styles.pill : 'bg-surface-2 text-muted'}`}>
          {items.length}
        </span>
      </header>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <QueueRow
              key={`${id}-${item.noteId}`}
              item={item}
              organizationName={organizationName}
              tone={tone}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export type QueueTone = 'neutral' | 'warn' | 'crit';

const TONES: Record<QueueTone, { pill: string; stripe: string }> = {
  neutral: { pill: 'bg-accent-soft text-accent-ink', stripe: 'var(--color-accent)' },
  warn: { pill: 'bg-warn-soft text-warn', stripe: 'var(--color-warn)' },
  crit: { pill: 'bg-crit-soft text-crit', stripe: 'var(--color-crit)' },
};

function QueueRow({
  item,
  organizationName,
  tone,
}: {
  item: QueueItem;
  organizationName: string;
  tone: QueueTone;
}) {
  const initials = item.debtorName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <li className="group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent-soft/30">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${TONES[tone].pill}`}
        aria-hidden
      >
        {initials || '—'}
      </span>

      <span className="min-w-0 flex-1">
        {/* La fila entera es el enlace: `stretched-link` cubre la tarjeta sin
            envolver los botones de contacto, que llevan a otro sitio. */}
        <Link
          href={`/pagares/${item.noteId}`}
          className="text-sm font-medium text-ink before:absolute before:inset-0 before:content-['']"
        >
          {item.debtorName}
        </Link>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span className="font-mono text-[11px] text-accent-ink">{item.folio}</span>
          {item.detail ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{item.detail}</span>
            </>
          ) : null}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold">
          <Money value={item.balance} />
        </span>
        <span className={`tnum block text-xs ${item.daysOverdue > 0 ? 'text-crit' : 'text-muted'}`}>
          {item.daysOverdue > 0 ? `${item.daysOverdue} d de atraso` : `vence ${shortDate(item.dueDate)}`}
        </span>
      </span>

      {/* Relativos y por encima del enlace de la fila, para que se puedan pulsar. */}
      <span className="relative z-10 flex shrink-0 items-center gap-1.5">
        <a
          href={whatsappHref(item, organizationName)}
          target="_blank"
          rel="noopener"
          className="btn btn-sm bg-ok-soft text-ok hover:bg-ok hover:text-white"
          title={`Escribir a ${item.debtorName} por WhatsApp`}
        >
          <NavIcon.whatsapp />
          WhatsApp
        </a>
        <a
          href={`tel:${item.debtorPhone}`}
          className="btn btn-secondary btn-sm"
          title={`Llamar al ${item.debtorPhone}`}
        >
          <NavIcon.phone />
          Llamar
        </a>
        <span className="text-muted transition-transform group-hover:translate-x-0.5" aria-hidden>
          <NavIcon.chevronRight />
        </span>
      </span>
    </li>
  );
}

/**
 * Enlace a WhatsApp con el mensaje ya escrito (§24.2). Sin proveedor ni coste:
 * abre la aplicación con el texto listo y el administrador da un tap.
 */
function whatsappHref(item: QueueItem, organizationName: string): string {
  const phone = item.debtorPhone.replace(/\D/g, '');
  const message =
    item.daysOverdue > 0
      ? `Buen día ${item.debtorName}. Le escribimos de ${organizationName} por su pagaré ${item.folio}, con saldo de ${item.balance} y ${item.daysOverdue} días de atraso. ¿Podemos acordar una fecha de pago?`
      : `Buen día ${item.debtorName}. Le recordamos de ${organizationName} que su pagaré ${item.folio} vence el ${item.dueDate}, con saldo de ${item.balance}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
