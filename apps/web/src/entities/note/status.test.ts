import { describe, expect, it } from 'vitest';
import { noteStatusSchema } from '@pagares/contracts';
import { STATUS_PRESENTATION, type NoteStatus } from './status';

/**
 * La presentación del estado es del front, pero la lista de estados es del
 * contrato (regla 3 del repositorio). Estas pruebas existen para que añadir un
 * estado en `contracts` rompa aquí y no en la pantalla del administrador.
 */
describe('presentación de los estados', () => {
  const states = noteStatusSchema.options as readonly NoteStatus[];

  it('cubre exactamente los estados del contrato', () => {
    expect(Object.keys(STATUS_PRESENTATION).sort()).toEqual([...states].sort());
  });

  it('cada estado trae etiqueta y descripción para lector de pantalla', () => {
    for (const state of states) {
      const presentation = STATUS_PRESENTATION[state];
      expect(presentation.label.length, state).toBeGreaterThan(0);
      // La descripción es más explícita que la etiqueta: si fueran iguales, el
      // lector de pantalla no diría nada que el chip no dijera ya.
      expect(presentation.description.length, state).toBeGreaterThan(
        presentation.label.length,
      );
    }
  });

  it('ningún estado se distingue sólo por color', () => {
    // §19.3: dos estados pueden compartir color, nunca etiqueta.
    const labels = states.map((state) => STATUS_PRESENTATION[state].label);
    expect(new Set(labels).size).toBe(states.length);
  });

  it('«dado de baja» no se confunde con «vencido»', () => {
    // Son cosas distintas y comparten el rojo: lo que las separa de un vistazo
    // es el relleno sólido.
    expect(STATUS_PRESENTATION.WRITTEN_OFF.chip).not.toBe(STATUS_PRESENTATION.OVERDUE.chip);
    // Y la deuda sigue siendo exigible: si la interfaz lo callara, el
    // administrador dejaría de cobrarla.
    expect(STATUS_PRESENTATION.WRITTEN_OFF.description).toContain('exigible');
  });
});
