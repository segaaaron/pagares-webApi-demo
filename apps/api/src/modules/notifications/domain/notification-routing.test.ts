import { describe, expect, it } from 'vitest';
import { inAppTitle, routeFor, routedEvents } from './notification-routing.js';

/**
 * Por dónde sale cada aviso (ADR 0023).
 *
 * Estas pruebas existen porque la política vivía en un `switch` que nadie podía
 * comprobar: para saber si el abono seguía mandando correo había que leerse el
 * despachador entero. Lo que se protege aquí es que nadie vuelva a colgar un
 * correo del ciclo del pagaré sin darse cuenta.
 */
describe('por correo sale el pagaré a firmar, y poco más', () => {
  it('emitir manda correo: exige una acción y la app puede estar cerrada', () => {
    expect(routeFor('NoteIssued')).toEqual({ channel: 'NOTE_EMAIL', kind: 'issued' });
  });

  it('el recordatorio manda correo: lo decide el administrador, no el sistema', () => {
    expect(routeFor('NoteReminderRequested')).toEqual({ channel: 'NOTE_EMAIL', kind: 'reminder' });
  });

  it('ningún otro evento del pagaré manda correo', () => {
    /*
     * La prueba que de verdad importa: recorre la tabla entera en vez de
     * comprobar los casos que alguien se acordó de escribir. Añadir mañana un
     * `NOTE_EMAIL` a un evento del ciclo la rompe aquí y no en la bandeja del
     * deudor.
     */
    const conCorreo = routedEvents().filter(
      (evento) => routeFor(evento).channel === 'NOTE_EMAIL',
    );
    expect(conCorreo.sort()).toEqual(['NoteIssued', 'NoteReminderRequested']);
  });

  it('abono, liquidación, anulación, prórroga y convenio se avisan en la aplicación', () => {
    for (const evento of [
      'PaymentRegistered',
      'NoteSettled',
      'NoteVoided',
      'NoteExtended',
      'SettlementCreated',
      'SettlementBroken',
    ]) {
      expect(routeFor(evento).channel, evento).toBe('IN_APP');
    }
  });

  it('la firma no avisa de nada: el deudor acaba de firmarla', () => {
    expect(routeFor('NoteSigned')).toEqual({ channel: 'SILENT' });
  });

  it('los correos de cuenta sobreviven: sin ellos nadie recupera su acceso', () => {
    for (const evento of [
      'UserCreated',
      'PasswordReset',
      'OtpIssued',
      'PasswordChanged',
      'AccountLocked',
      'RefreshReused',
    ]) {
      expect(routeFor(evento).channel, evento).toBe('ACCOUNT_EMAIL');
    }
  });

  it('un evento sin ruta no avisa, y eso no es un error', () => {
    // Hay eventos que sólo existen para la bitácora y para otros módulos.
    expect(routeFor('NoteWrittenOff')).toEqual({ channel: 'SILENT' });
    expect(routeFor('CualquierCosaNueva')).toEqual({ channel: 'SILENT' });
  });
});

describe('lo que dice el aviso de la aplicación', () => {
  it('cada aviso nombra el folio: sin él el deudor no sabe de cuál le hablan', () => {
    for (const evento of routedEvents()) {
      const ruta = routeFor(evento);
      if (ruta.channel !== 'IN_APP') continue;
      const texto = inAppTitle(ruta.kind, 'PAG-2026-000128');
      expect(texto, evento).toBeTruthy();
      expect(texto, evento).toContain('PAG-2026-000128');
    }
  });

  it('un tipo sin texto no inventa uno', () => {
    expect(inAppTitle('lo-que-sea', 'PAG-2026-000128')).toBeNull();
  });
});
