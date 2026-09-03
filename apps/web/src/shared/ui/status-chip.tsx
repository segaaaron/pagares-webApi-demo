import { STATUS_PRESENTATION, type NoteStatus } from '@/entities/note/status';

/** Chip de estado: color, forma y texto. Nunca sólo color (§19.3). */
export function StatusChip({ status }: { status: NoteStatus }) {
  const s = STATUS_PRESENTATION[status];
  return (
    <span
      className={`chip ${s.chip}`}
      title={s.description}
    >
      <span className="sr-only">Estado: </span>
      {s.label}
    </span>
  );
}
