/** Fila mínima para calcular cartera: saldo vivo, vencimiento y si hay convenio. */
export interface OpenBalanceRow {
  amountCents: bigint;
  paidCents: bigint;
  dueDate: string;
  /** En convenio: sigue con saldo, pero su estado es RESTRUCTURED, no OVERDUE. */
  inSettlement: boolean;
}

export interface IssuedRow {
  folio: string;
  issueDate: string;
  amountCents: bigint;
  debtorName: string;
}

export interface SettledRow {
  folio: string;
  dueDate: string;
  settledOn: string;
  amountCents: bigint;
  daysToSettle: number;
  debtorName: string;
}

export interface RecoveryRow {
  paidOn: string;
  amountCents: bigint;
  interestCents: bigint;
  principalCents: bigint;
  isRecovery: boolean;
  /** Condonación del remanente: cierra el pagaré, no entra caja (§25.16). */
  isWaiver: boolean;
}

export interface WrittenOffRow {
  folio: string;
  debtorName: string;
  writtenOffAt: string;
  reason: string | null;
  writtenOffCents: bigint;
  recoveredCents: bigint;
}

export interface SettlementRow {
  folio: string;
  debtorName: string;
  status: string;
  agreedCents: bigint;
  forgivenCents: bigint;
  dueOn: string;
}

export interface ActivityRow {
  type: string;
  outcome: string;
  promisedOn: string | null;
  createdAt: string;
}

export interface ConcentrationRow {
  debtorName: string;
  balanceCents: bigint;
  notes: number;
}

export interface PortfolioCounts {
  total: number;
  overdue: number;
}

/** Un mes de la gráfica: lo que entró y lo que se colocó. */
export interface MonthlyFlowRow {
  /** `YYYY-MM`, en zona de negocio. */
  month: string;
  collectedCents: bigint;
  issuedCents: bigint;
}

/**
 * Fila de la exportación contable de cartera (§17.2). Lleva el detalle que pide
 * la contabilidad —folio, deudor, importe, abonado y saldo— y no los agregados,
 * que son para decidir, no para cuadrar.
 */
export interface LedgerNoteRow {
  folio: string;
  debtorName: string;
  status: string;
  issueDate: string;
  dueDate: string;
  amountCents: bigint;
  paidCents: bigint;
  interestRateAnnualPct: number | null;
}

export interface LedgerPaymentRow {
  folio: string;
  debtorName: string;
  paidOn: string;
  amountCents: bigint;
  interestCents: bigint;
  principalCents: bigint;
  method: string;
  reference: string | null;
  isReversal: boolean;
  /** Qué abono reversa esta fila, cuando lo es. El original nunca se toca (§12.2). */
  reversalOfId: string | null;
  /** Abono sobre un pagaré castigado: renglón propio en contabilidad (§13.7). */
  isRecovery: boolean;
  /** Condonación del remanente: cierra el pagaré, no entra caja (§25.16). */
  isWaiver: boolean;
}

/**
 * Pagaré cuyo saldo denormalizado no cuadra con su libro de abonos (§22.5).
 * La verdad son las filas; `paidCents` es una copia para no sumar en cada
 * lectura, y una copia que se desvía hay que verla.
 */
export interface BalanceMismatchRow {
  id: string;
  folio: string;
  debtorName: string;
  storedPaidCents: bigint;
  ledgerPaidCents: bigint;
}

export interface ReportRepository {
  /** Pagarés con saldo vivo: excluye finales y los previos a la firma. */
  openBalances(): Promise<OpenBalanceRow[]>;
  /**
   * Suma de abonos desde una fecha, reversas incluidas con su signo. Excluye
   * las condonaciones: cierran el pagaré, pero no entró dinero (§25.16).
   */
  collectedSince(from: string): Promise<bigint>;
  /** Cobrado y colocado mes a mes, para la gráfica de evolución (§19.3). */
  monthlyFlow(fromMonth: string): Promise<MonthlyFlowRow[]>;
  issuedBetween(from: string, to: string): Promise<IssuedRow[]>;
  settledBetween(from: string, to: string): Promise<SettledRow[]>;
  paymentsBetween(from: string, to: string): Promise<RecoveryRow[]>;
  writtenOff(): Promise<WrittenOffRow[]>;
  settlements(): Promise<SettlementRow[]>;
  activitiesBetween(from: string, to: string): Promise<ActivityRow[]>;
  concentration(): Promise<ConcentrationRow[]>;
  /** Detalle de la cartera al corte, para la exportación contable (§17.2). */
  portfolioLedger(): Promise<LedgerNoteRow[]>;
  /** Detalle de abonos de un periodo, reversas incluidas. */
  paymentsLedger(from: string, to: string): Promise<LedgerPaymentRow[]>;
  /** Pagarés cuyo `paidCents` no coincide con la suma de sus abonos (§22.5). */
  balanceMismatches(): Promise<BalanceMismatchRow[]>;
}

export const REPORT_REPOSITORY = Symbol('ReportRepository');
