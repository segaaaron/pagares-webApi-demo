import { Body, Controller, Get, Put } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { Roles } from '../../shared/http/auth.guard.js';
import { SettingsService } from './settings.service.js';

const updateSchema = z
  .object({
    legalName: z.string().trim().min(3).max(160),
    address: z.string().trim().min(3).max(240),
    phone: z.string().trim().max(20).nullable(),
    email: z.string().trim().email().nullable(),
    defaultIssuePlace: z.string().trim().min(2).max(120),
    defaultPaymentPlace: z.string().trim().min(2).max(120),
    defaultTermDays: z.number().int().min(1).max(3650),
    defaultInterestRateAnnualPct: z.number().min(0).max(100).nullable(),
    // Cómo se pacta en esta casa: mensual o anual (§12.3).
    defaultInterestPeriod: z.enum(['MONTHLY', 'ANNUAL']),
    interestBasis: z.union([z.literal(360), z.literal(365)]),
    // Umbral que dispara la advertencia de tasa: avisa, no impide (§25.14).
    interestWarningThresholdPct: z.number().min(0).max(1000),
    applyPaymentToInterestFirst: z.boolean(),
    prescriptionYears: z.number().int().min(1).max(20),
    bankName: z.string().trim().max(80).nullable(),
    bankAccount: z.string().trim().max(40).nullable(),
    bankClabe: z.string().trim().max(40).nullable(),
    paymentReference: z.string().trim().max(160).nullable(),
  })
  .strict();

@Controller({ path: 'admin/settings', version: '1' })
@Roles('ADMIN')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async read() {
    return this.settings.read();
  }

  @Put()
  async update(@Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>) {
    return this.settings.update(body);
  }
}
