import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '@pagares/api-core';
import type { Request } from 'express';
import { Public } from '../../shared/http/auth.guard.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { deliveryStatusFor, verifySvixSignature } from './domain/svix-signature.js';

interface ResendEvent {
  type?: string;
  data?: { email_id?: string; bounce?: { message?: string } };
}

/**
 * Webhooks de entrega de Resend (§16).
 *
 * `@Public()` justificado: quien llama es el proveedor, no un usuario, y no
 * puede traer token. Lo que sustituye al guard es la firma HMAC del cuerpo: sin
 * secreto configurado el endpoint responde 503 y no acepta nada, porque un
 * webhook sin verificar deja que cualquiera marque como entregado un correo que
 * nunca salió (§9.1).
 */
@Controller({ path: 'webhooks', version: '1' })
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Public()
  @Post('resend')
  @HttpCode(204)
  async resend(
    @Headers('svix-id') id: string | undefined,
    @Headers('svix-timestamp') timestamp: string | undefined,
    @Headers('svix-signature') signature: string | undefined,
    @Body() body: ResendEvent,
    @Req() request: Request & { rawBody?: Buffer },
  ): Promise<void> {
    const secret = this.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException('El webhook de entregas no está configurado');
    }
    if (!id || !timestamp || !signature || !request.rawBody) {
      throw new UnauthorizedException('Falta la firma del webhook');
    }

    const valid = verifySvixSignature({
      secret,
      headers: { id, timestamp, signature },
      // Sobre el cuerpo crudo: reserializar el JSON cambia el HMAC.
      rawBody: request.rawBody.toString('utf8'),
      nowSeconds: Math.floor(this.clock.now().getTime() / 1000),
    });
    if (!valid) throw new UnauthorizedException('La firma del webhook no cuadra');

    const messageId = body.data?.email_id;
    const status = deliveryStatusFor(body.type ?? '');
    if (!messageId || !status) return;

    const delivered = status === 'DELIVERED' ? this.clock.now() : null;

    // `updateMany` y no `update`: un evento de un correo que no conocemos —de
    // otro entorno apuntando al mismo webhook— no es un error que reintentar.
    const changed = await this.prisma.emailDelivery.updateMany({
      where: { messageId },
      data: {
        status,
        lastEvent: body.type ?? null,
        ...(delivered ? { deliveredAt: delivered } : {}),
        ...(status === 'BOUNCED' || status === 'FAILED'
          ? { error: body.data?.bounce?.message ?? body.type ?? 'sin detalle' }
          : {}),
      },
    });

    if (changed.count === 0) {
      this.logger.warn({ messageId, event: body.type, reason: 'entrega desconocida' });
    }

    // Un recordatorio también lleva su propio estado, para que el detalle del
    // pagaré no tenga que cruzar tablas para pintarlo (§13.1).
    await this.prisma.reminderLog.updateMany({ where: { messageId }, data: { status } });
  }
}
