import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/persistence/prisma.service.js';

/**
 * Configuración de la organización (§13.7). Una sola fila: los valores por
 * defecto viven aquí y no se teclean en cada pagaré.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Instalación recién migrada: la fila todavía no existe.
   *
   * Antes esto lanzaba, y el panel entero se caía con un error de servidor
   * —incluidas las pantallas que no necesitan la configuración para nada—. Peor:
   * la única salida era guardar los ajustes, y guardar hacía `update`, que exige
   * una fila que aún no había. No se podía entrar ni configurar.
   *
   * Ahora se devuelven los valores en blanco con `configured: false`: el panel
   * abre, las tablas salen vacías y Ajustes puede rellenarlos. Nada se inventa:
   * los campos legales van vacíos, que es exactamente lo que hay.
   */
  async read() {
    const row = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    if (!row) return { ...EN_BLANCO, configured: false };

    return {
      ...row,
      defaultInterestRateAnnualPct: row.defaultInterestRateAnnualPct?.toString() ?? null,
      interestWarningThresholdPct: row.interestWarningThresholdPct.toString(),
      // Dinero en centavos: viaja como cadena, como todo `BigInt` del sistema.
      settlementToleranceCents: row.settlementToleranceCents.toString(),
      configured: true,
    };
  }

  /** `upsert`, no `update`: la primera vez que se guarda, la fila nace aquí. */
  async update(data: Record<string, unknown>) {
    const { settlementToleranceCents, ...resto } = data;
    const valores = {
      ...resto,
      ...(settlementToleranceCents !== undefined
        ? { settlementToleranceCents: BigInt(String(settlementToleranceCents)) }
        : {}),
    };
    const row = await this.prisma.organizationSettings.upsert({
      where: { id: 'singleton' },
      update: valores as never,
      create: { id: 'singleton', ...valores } as never,
    });
    return {
      ...row,
      defaultInterestRateAnnualPct: row.defaultInterestRateAnnualPct?.toString() ?? null,
      interestWarningThresholdPct: row.interestWarningThresholdPct.toString(),
      settlementToleranceCents: row.settlementToleranceCents.toString(),
      configured: true,
    };
  }
}

/** Lo que ve una instalación sin configurar. Coincide con los valores por defecto del esquema. */
const EN_BLANCO = {
  id: 'singleton',
  legalName: '',
  address: '',
  phone: null,
  email: null,
  logoAssetId: null,
  defaultIssuePlace: '',
  defaultPaymentPlace: '',
  currency: 'MXN',
  defaultTermDays: 30,
  defaultInterestRateAnnualPct: null,
  interestBasis: 360,
  defaultInterestPeriod: 'MONTHLY',
  interestWarningThresholdPct: '60',
  applyPaymentToInterestFirst: true,
  prescriptionYears: 3,
  issueNonNegotiable: false,
  settlementToleranceCents: '0',
  timezone: 'America/Mexico_City',
  noteFolioPrefix: 'PAG',
  receiptFolioPrefix: 'REC',
  statementPrefix: 'EDC',
  // Sin estos campos, una instalación recién migrada devolvía un objeto al que
  // le faltaban claves que el panel y la aplicación del cliente sí declaran.
  bankName: null,
  bankAccount: null,
  bankClabe: null,
  paymentReference: null,
} as const;
