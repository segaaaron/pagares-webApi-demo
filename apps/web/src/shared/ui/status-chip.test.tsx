import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { noteStatusSchema } from '@pagares/contracts';
import { StatusChip } from './status-chip';
import { STATUS_PRESENTATION, type NoteStatus } from '@/entities/note/status';

/**
 * El chip de estado es lo primero que se lee de una fila. Estas pruebas fijan
 * la regla de §19.3: el estado se dice con texto, el color sólo acompaña.
 */
describe('chip de estado', () => {
  const states = noteStatusSchema.options as readonly NoteStatus[];

  it('cada estado sale con su etiqueta escrita', () => {
    for (const state of states) {
      const { container } = render(<StatusChip status={state} />);
      expect(container.textContent, state).toContain(STATUS_PRESENTATION[state].label);
    }
  });

  it('un lector de pantalla oye «Estado:» antes de la etiqueta', () => {
    const { container } = render(<StatusChip status="OVERDUE" />);
    // Sin esto, en una tabla se oye "Vencido" suelto y no se sabe de qué.
    expect(container.querySelector('.sr-only')?.textContent).toBe('Estado: ');
  });

  it('la descripción larga viaja en el título', () => {
    const { container } = render(<StatusChip status="WRITTEN_OFF" />);
    expect(container.firstElementChild?.getAttribute('title')).toContain('exigible');
  });
});
