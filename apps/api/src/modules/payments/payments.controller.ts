import { Body, Controller, Post, Req } from '@nestjs/common';
import { reasonSchema } from '@pagares/contracts';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { VoidPaymentUseCase } from './application/void-payment.use-case.js';
import { Param } from '@nestjs/common';

@Controller({ path: 'admin/payments', version: '1' })
@Roles('ADMIN')
export class PaymentsController {
  constructor(private readonly voidPayment: VoidPaymentUseCase) {}

  /** Anular un abono asienta una reversa; el original nunca se toca (§12.2). */
  @Post(':id/void')
  async void(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reasonSchema.strict())) body: z.infer<typeof reasonSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.voidPayment.execute(
      { paymentId: id, ...body },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }
}
