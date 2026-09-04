/**
 * Presentación de los diez estados (§11.1). El estado NUNCA se distingue sólo
 * por color: cada uno lleva chip con texto y una franja lateral, para que sea
 * legible con daltonismo y en una impresión en blanco y negro.
 */
export type NoteStatus =
  | 'PENDING_SIGNATURE'
  | 'PROCESSING_SIGNATURE'
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'OVERDUE'
  | 'PAID'
  | 'RESTRUCTURED'
  | 'RENEWED'
  | 'WRITTEN_OFF'
  | 'VOID';

export interface StatusPresentation {
  readonly label: string;
  readonly chip: string;
  readonly stripe: string;
  /** Descripción para lectores de pantalla, más explícita que la etiqueta. */
  readonly description: string;
}

export const STATUS_PRESENTATION: Record<NoteStatus, StatusPresentation> = {
  PENDING_SIGNATURE: {
    label: 'Por firmar',
    chip: 'bg-surface-2 text-ink-2',
    stripe: 'bg-line-strong',
    description: 'Enviado al cliente, pendiente de firma',
  },
  PROCESSING_SIGNATURE: {
    label: 'Procesando',
    chip: 'bg-surface-2 text-muted',
    stripe: 'bg-line',
    description: 'Firma recibida, procesándose',
  },
  ISSUED: {
    label: 'Vigente',
    chip: 'bg-accent-soft text-accent-ink',
    stripe: 'bg-accent',
    description: 'Firmado y al corriente',
  },
  PARTIALLY_PAID: {
    label: 'Abonado',
    chip: 'bg-accent-soft text-accent-ink',
    stripe: 'bg-accent',
    description: 'Con abonos parciales, saldo pendiente',
  },
  OVERDUE: {
    label: 'Vencido',
    chip: 'bg-crit-soft text-crit',
    stripe: 'bg-crit',
    description: 'Vencido, con saldo pendiente',
  },
  PAID: {
    label: 'Liquidado',
    chip: 'bg-ok-soft text-ok',
    stripe: 'bg-ok',
    description: 'Pagado en su totalidad',
  },
  RESTRUCTURED: {
    label: 'En convenio',
    chip: 'bg-warn-soft text-warn',
    stripe: 'bg-warn',
    description: 'Con convenio de pago vigente',
  },
  RENEWED: {
    label: 'Renovado',
    chip: 'bg-surface-2 text-muted',
    stripe: 'bg-line-strong',
    description: 'Sustituido por un pagaré nuevo',
  },
  WRITTEN_OFF: {
    label: 'Dado de baja',
    // Relleno sólido, no suave: es lo único que lo separa de "Vencido" de un
    // vistazo, y son cosas muy distintas.
    chip: 'bg-crit text-white',
    stripe: 'bg-crit',
    // El matiz importa y la interfaz debe decirlo, no esconderlo.
    description: 'Dado de baja contablemente; la deuda sigue siendo exigible',
  },
  VOID: {
    label: 'Anulado',
    chip: 'bg-surface-2 text-muted line-through',
    stripe: 'bg-line',
    description: 'Cancelado con motivo; no computa en la cartera',
  },
};
