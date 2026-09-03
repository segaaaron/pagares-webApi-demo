'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * Campo de fecha con calendario propio, en español.
 *
 * El `<input type="date">` del navegador se pinta con el idioma **del
 * navegador**, no con el `lang` de la página: en un Chrome en inglés escribe
 * `mm/dd/yyyy` aunque la aplicación esté en español, y eso invita a teclear el
 * mes donde va el día. Aquí el calendario es nuestro, así que dice lunes,
 * "sep 2026" y `dd/mm/aaaa` siempre.
 *
 * El valor viaja en un `<input type="hidden">` en ISO `YYYY-MM-DD`, que es lo
 * que espera la API; lo que se teclea es la forma civil mexicana.
 */
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
/** La semana mexicana empieza en lunes. */
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function toCivil(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

/**
 * Da formato mientras se escribe: `22091984` → `22/09/1984`.
 *
 * Nadie teclea las barras. Se aceptan los separadores que la gente usa por
 * costumbre —barra, guion o punto— y se normalizan a barras; los dígitos de
 * más se descartan en vez de dejar que crezca una cadena imposible.
 */
function mask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function toIso(civil: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(civil.trim());
  if (!match) return null;
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Rechaza el 31 de febrero: el calendario lo corregiría en silencio.
  const parsed = new Date(`${iso}T00:00:00Z`);
  return parsed.getUTCDate() === day && parsed.getUTCMonth() + 1 === month ? iso : null;
}

export function DateField({
  name,
  label,
  id: givenId,
  defaultValue = '',
  required = false,
  min,
  max,
}: {
  name: string;
  /** Si el campo ya vive dentro de un `<Field>`, la etiqueta la pone él. */
  label?: string;
  id?: string;
  defaultValue?: string;
  required?: boolean;
  /** Límites en ISO; los días fuera de rango salen deshabilitados. */
  min?: string;
  max?: string;
}) {
  const generated = useId();
  const id = givenId ?? generated;
  const [iso, setIso] = useState(defaultValue);
  const [text, setText] = useState(toCivil(defaultValue));
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date(`${defaultValue || todayIso()}T00:00:00Z`));
  const root = useRef<HTMLDivElement>(null);

  // Clic fuera y Escape cierran: un calendario abierto tapa el formulario.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openCalendar = (): void => {
    // Abrir siempre donde está el dato: si ya hay fecha, en su mes; si el
    // usuario la tecleó hace un momento, en la que acaba de teclear.
    setCursor(new Date(`${toIso(text) ?? (iso || todayIso())}T00:00:00Z`));
    setOpen((v) => !v);
  };

  const commit = (value: string): void => {
    const formatted = mask(value);
    setText(formatted);
    const parsed = toIso(formatted);
    setIso(parsed ?? '');
    // El calendario sigue a lo que se escribe: en cuanto la fecha es válida se
    // planta en su mes, así que abrirlo ya no obliga a navegar hasta ella.
    if (parsed) setCursor(new Date(`${parsed}T00:00:00Z`));
  };

  const pick = (day: Date): void => {
    const picked = day.toISOString().slice(0, 10);
    setIso(picked);
    setText(toCivil(picked));
    setOpen(false);
  };

  // Mientras se teclea no hay error: sólo cuando ya están los ocho dígitos y
  // la fecha sigue sin existir (un 31 de febrero, por ejemplo).
  const invalid = text.replace(/\D/g, '').length === 8 && toIso(text) === null;

  return (
    <div className="relative" ref={root}>
      {label ? (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      <div className="flex">
        <input
          id={id}
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          maxLength={10}
          value={text}
          onChange={(event) => commit(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className="input rounded-r-none"
        />
        <button
          type="button"
          onClick={openCalendar}
          aria-label={label ? `Abrir calendario de ${label.toLowerCase()}` : 'Abrir calendario'}
          aria-expanded={open}
          className="btn btn-secondary -ml-px rounded-l-none px-2.5"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </button>
      </div>
      <input type="hidden" name={name} value={iso} required={required} />
      {invalid ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-crit">
          Esa fecha no existe. Revisa el día y el mes.
        </p>
      ) : null}

      {open ? (
        <Calendar
          cursor={cursor}
          selected={iso}
          onCursor={setCursor}
          onPick={pick}
          {...(min !== undefined ? { min } : {})}
          {...(max !== undefined ? { max } : {})}
        />
      ) : null}
    </div>
  );
}

function Calendar({
  cursor,
  selected,
  onCursor,
  onPick,
  min,
  max,
}: {
  cursor: Date;
  selected: string;
  onCursor: (date: Date) => void;
  onPick: (date: Date) => void;
  min?: string;
  max?: string;
}) {
  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  // getUTCDay() da 0 en domingo; aquí la semana arranca en lunes.
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const today = todayIso();

  const shift = (delta: number): void => onCursor(new Date(Date.UTC(year, month + delta, 1)));
  const shiftYear = (delta: number): void => onCursor(new Date(Date.UTC(year + delta, month, 1)));
  const todayDate = new Date(`${today}T00:00:00Z`);
  const todayBlocked = (min !== undefined && today < min) || (max !== undefined && today > max);

  return (
    <div
      role="dialog"
      aria-label="Calendario"
      className="card absolute left-0 top-full z-20 mt-1.5 w-[17.5rem] p-3.5 shadow-[var(--shadow-pop)]"
    >
      <div className="mb-2.5 flex items-center justify-between gap-1">
        <div className="flex">
          <CalendarNav label="Año anterior" onClick={() => shiftYear(-1)} d="m17 6-6 6 6 6M11 6l-6 6 6 6" />
          <CalendarNav label="Mes anterior" onClick={() => shift(-1)} d="m14 6-6 6 6 6" />
        </div>
        <p className="text-sm font-medium capitalize">
          {MONTHS[month]} <span className="tnum text-muted">{year}</span>
        </p>
        <div className="flex">
          <CalendarNav label="Mes siguiente" onClick={() => shift(1)} d="m10 6 6 6-6 6" />
          <CalendarNav label="Año siguiente" onClick={() => shiftYear(1)} d="m7 6 6 6-6 6M13 6l6 6-6 6" />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((day, i) => (
          <span key={`${day}-${i}`} className="py-1 text-[10px] font-medium uppercase text-muted">
            {day}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const date = new Date(Date.UTC(year, month, i + 1));
          const iso = date.toISOString().slice(0, 10);
          const isSelected = iso === selected;
          const isToday = iso === today;
          // Fuera de rango se deshabilita, no se esconde: así se ve que existe
          // y por qué no se puede elegir.
          const disabled = (min !== undefined && iso < min) || (max !== undefined && iso > max);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(date)}
              disabled={disabled}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              className={`tnum h-8 rounded-md text-sm transition-colors disabled:cursor-not-allowed disabled:text-muted/50 ${
                isSelected
                  ? 'bg-accent font-semibold text-white'
                  : isToday
                    ? 'bg-accent-soft font-semibold text-accent-ink'
                    : 'hover:bg-surface-2'
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Atajos: nueve de cada diez fechas que se escriben aquí son hoy o de
          esta semana, y llegar a ellas no debería costar tres clics. */}
      <div className="mt-2.5 flex items-center gap-1 border-t border-line pt-2">
        <button
          type="button"
          disabled={todayBlocked}
          onClick={() => onPick(todayDate)}
          className="btn btn-ghost btn-sm"
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={() => onPick(new Date(todayDate.getTime() + 7 * 86_400_000))}
          className="btn btn-ghost btn-sm"
        >
          En 7 días
        </button>
        <button
          type="button"
          onClick={() => onPick(new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1, todayDate.getUTCDate())))}
          className="btn btn-ghost btn-sm"
        >
          En un mes
        </button>
      </div>
    </div>
  );
}

/** Los cuatro botones de navegación del calendario son el mismo botón. */
function CalendarNav({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="btn btn-ghost btn-sm px-1.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </button>
  );
}

/**
 * Hoy en zona de negocio, sólo para resaltar el día en el calendario. No se
 * envía a ningún sitio: la fecha que vale la calcula el servidor con su Clock.
 */
function todayIso(): string {
  // eslint-disable-next-line no-restricted-syntax -- reloj del navegador para pintar, nunca para decidir
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(now);
}
