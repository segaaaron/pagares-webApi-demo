import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/persistence/prisma.service.js';

/**
 * Configuración de la organización (§13.7). Una sola fila: los valores por
 * defecto viven aquí y no se teclean en cada pagaré.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async read() {
    const row = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    if (!row) {
      // Sin configuración no se puede emitir: mejor decirlo que inventar valores.
      throw new Error('Falta configurar la organización. Ejecuta el seed o guarda los ajustes.');
    }
    return {
      ...row,
      defaultInterestRateAnnualPct: row.defaultInterestRateAnnualPct?.toString() ?? null,
      interestWarningThresholdPct: row.interestWarningThresholdPct.toString(),
    };
  }

  async update(data: Record<string, unknown>) {
    const row = await this.prisma.organizationSettings.update({
      where: { id: 'singleton' },
      data: data as never,
    });
    return { ...row, defaultInterestRateAnnualPct: row.defaultInterestRateAnnualPct?.toString() ?? null };
  }
}
