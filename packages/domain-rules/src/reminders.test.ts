import { describe, expect, it } from 'vitest';
import { ruleForToday, type ReminderRuleData, type ReminderTarget } from './reminders.js';

const rule = (partial: Partial<ReminderRuleData> & { offsetDays: number }): ReminderRuleData => ({
  id: `r${partial.offsetDays}`,
  channel: 'EMAIL',
  templateId: partial.offsetDays > 0 ? 'overdue-notice' : 'due-reminder',
  active: true,
  ...partial,
});

const target = (partial: Partial<ReminderTarget> = {}): ReminderTarget => ({
  offsetDays: 0,
  balanceCents: 25_000_00n,
  debtorId: 'deudor-1',
  inLitigation: false,
  ...partial,
});

const RULES = [rule({ offsetDays: -7 }), rule({ offsetDays: -1 }), rule({ offsetDays: 7 })];

describe('motor de recordatorios', () => {
  it('toca el último tramo cruzado, no el siguiente', () => {
    // Tres días de atraso: ya pasó el aviso de −1, todavía no el de +7.
    expect(ruleForToday(RULES, target({ offsetDays: 3 }))?.offsetDays).toBe(-1);
  });

  it('no aplica ninguna regla antes del primer tramo', () => {
    expect(ruleForToday(RULES, target({ offsetDays: -30 }))).toBeNull();
  });

  it('cruzar un tramo más avanzado cambia la plantilla', () => {
    const chosen = ruleForToday(RULES, target({ offsetDays: 40 }));
    expect(chosen?.offsetDays).toBe(7);
    expect(chosen?.templateId).toBe('overdue-notice');
  });

  it('ignora las reglas apagadas sin borrarlas', () => {
    const rules = [rule({ offsetDays: -1, active: false }), rule({ offsetDays: -7 })];
    expect(ruleForToday(rules, target({ offsetDays: 0 }))?.offsetDays).toBe(-7);
  });

  it('un pagaré sin saldo no genera aviso', () => {
    expect(ruleForToday(RULES, target({ offsetDays: 10, balanceCents: 0n }))).toBeNull();
  });

  it('un expediente judicial congela los avisos automáticos', () => {
    expect(ruleForToday(RULES, target({ offsetDays: 120, inLitigation: true }))).toBeNull();
  });

  it('respeta el saldo mínimo de la condición', () => {
    const rules = [rule({ offsetDays: 0, condition: { minBalanceCents: '5000000' } })];
    expect(ruleForToday(rules, target({ balanceCents: 1_000_00n }))).toBeNull();
    expect(ruleForToday(rules, target({ balanceCents: 60_000_00n }))?.offsetDays).toBe(0);
  });

  it('respeta el deudor de la condición', () => {
    const rules = [rule({ offsetDays: 0, condition: { debtorId: 'otro' } })];
    expect(ruleForToday(rules, target())).toBeNull();
  });
});
