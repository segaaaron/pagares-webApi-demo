import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { reminderRulesPutSchema, type ReminderRulesPut } from '@pagares/contracts';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';
import {
  ListReminderRulesUseCase,
  ReplaceReminderRulesUseCase,
} from './application/reminder-rules.use-case.js';
import { PreviewReminderUseCase } from './application/preview-reminder.use-case.js';

const previewSchema = z
  .object({
    /** Con un pagaré real la vista previa lleva cifras reales. */
    noteId: z.string().uuid().optional(),
    /** Manda además el correo de prueba a la cuenta del administrador. */
    sendTest: z.boolean().default(false),
  })
  .strict();

/**
 * Reglas del motor de recordatorios (§13.1, §15).
 *
 * Son configuración, no código: qué se avisa, cuándo y con qué plantilla se
 * decide aquí. Nada se manda solo —§18— pero cuando el administrador pulsa
 * "enviar recordatorio", la regla del tramo es la que elige el texto.
 */
@Controller({ path: 'admin/reminder-rules', version: '1' })
@Roles('ADMIN')
export class ReminderRulesController {
  constructor(
    private readonly list: ListReminderRulesUseCase,
    private readonly replace: ReplaceReminderRulesUseCase,
    private readonly preview: PreviewReminderUseCase,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async read(@CurrentActor() actor: Actor, @Req() request: Request & { traceId?: string }) {
    return this.list.execute({}, this.contextOf(actor, request));
  }

  @Put()
  async update(
    @Body(new ZodValidationPipe(reminderRulesPutSchema)) body: ReminderRulesPut,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.replace.execute({ rules: body.rules }, this.contextOf(actor, request));
  }

  /** Vista previa y envío de prueba de una regla (§24.5). */
  @Post(':id/preview')
  @HttpCode(200)
  async previewRule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(previewSchema)) body: z.infer<typeof previewSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    // La prueba va a la cuenta de quien la pide, nunca a una dirección del
    // cuerpo: si el destinatario fuera un parámetro, esto sería un relay abierto.
    const admin = body.sendTest
      ? await this.prisma.user.findUnique({ where: { id: actor.id }, select: { email: true } })
      : null;

    return this.preview.execute(
      {
        ruleId: id,
        ...(body.noteId !== undefined ? { noteId: body.noteId } : {}),
        ...(admin?.email !== undefined ? { sendTestTo: admin.email } : {}),
      },
      this.contextOf(actor, request),
    );
  }

  private contextOf(actor: Actor, request: Request & { traceId?: string }) {
    return {
      traceId: request.traceId ?? 'unknown',
      actorId: actor.id,
      actorRole: actor.role,
      ...(request.ip !== undefined ? { ip: request.ip } : {}),
    };
  }
}
