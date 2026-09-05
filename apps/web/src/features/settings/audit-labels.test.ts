import { describe, expect, it } from 'vitest';
import { auditLabel, auditSubject } from './audit-labels';

/**
 * La bitácora existe para contestar «¿quién anuló ese abono?». Estas pruebas
 * fijan las dos mitades de esa respuesta: la frase en español y **sobre qué**
 * fue, que es justo lo que faltaba y hacía inútil el registro.
 */
describe('sobre qué fue la acción', () => {
  it('saca el importe del movimiento', () => {
    const sujeto = auditSubject({
      targetType: 'PromissoryNote',
      targetId: 'nota-1',
      metadata: { paymentId: 'abono-1', amountCents: '250000' },
    });

    expect(sujeto.amountCents).toBe('250000');
    // El identificador permite abrir el pagaré desde la bitácora.
    expect(sujeto.noteId).toBe('nota-1');
  });

  it('saca el folio cuando la acción lo guardó', () => {
    expect(auditSubject({ targetType: 'PromissoryNote', metadata: { folio: 'PAG-2026-000123' } }).folio)
      .toBe('PAG-2026-000123');
    // La renovación lo guarda con otro nombre porque nace un título nuevo.
    expect(auditSubject({ targetType: 'PromissoryNote', metadata: { newFolio: 'PAG-2026-000900' } }).folio)
      .toBe('PAG-2026-000900');
  });

  it('lo que no es un pagaré no ofrece enlace a ninguno', () => {
    // Un acceso borrado apunta a un usuario: enlazar a /pagares/<id de usuario>
    // llevaría a una pantalla que no existe.
    const sujeto = auditSubject({ targetType: 'User', targetId: 'usuario-1', metadata: { role: 'CLIENT' } });
    expect(sujeto.noteId).toBeUndefined();
  });

  it('no se fía de la forma del metadato', () => {
    /*
     * Es un `unknown` que viene de la base y se guardó hace meses: si trae
     * basura, la bitácora tiene que seguir leyéndose en vez de romperse.
     */
    for (const metadata of [null, undefined, 'texto', 42, { amountCents: 'mucho' }, { folio: '' }]) {
      const sujeto = auditSubject({ targetType: 'PromissoryNote', metadata });
      expect(sujeto.amountCents).toBeUndefined();
      expect(sujeto.folio).toBeUndefined();
    }
  });
});

describe('la frase de cada acción', () => {
  it('marca aparte lo que hay que mirar, y dice qué hacer', () => {
    const anulado = auditLabel('note.void');
    expect(anulado.tone).toBe('atencion');
    // Un aviso sin nada que hacer es media respuesta.
    expect(anulado.hint).toBeTruthy();
  });

  it('un código desconocido se enseña como está', () => {
    // Mejor el código crudo que «otra acción»: al menos se puede buscar.
    expect(auditLabel('cosa.rara').text).toBe('cosa.rara');
  });
});
