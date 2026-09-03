import { Body, Controller, Get, Param, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import { z } from 'zod';
import {
  centsSchema,
  civilDateSchema,
  createNoteRequestSchema,
  reasonSchema,
  writtenConfirmationSchema,
  listNotesQuerySchema,
  registerPaymentRequestSchema,
  type CreateNoteRequest,
  type RegisterPaymentRequest,
} from '@pagares/contracts';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { IssueNoteUseCase } from './application/issue-note.use-case.js';
import { RegisterPaymentUseCase } from '../payments/application/register-payment.use-case.js';
import { ListNotesUseCase } from './application/list-notes.use-case.js';
import { GetNoteDetailUseCase } from './application/get-note-detail.use-case.js';
import { SimulateSettlementUseCase } from './application/simulate-settlement.use-case.js';
import { ChangeNoteStatusUseCase } from './application/change-note-status.use-case.js';
import { ExtendNoteUseCase } from './application/extend-note.use-case.js';
import { RenewNoteUseCase } from './application/renew-note.use-case.js';
import { CreateSettlementUseCase } from '../settlements/application/create-settlement.use-case.js';
import { VoidPaymentUseCase } from '../payments/application/void-payment.use-case.js';
import { DispatchPendingService } from '../notifications/application/dispatch-pending.service.js';

const extendSchema = z
  .object({ newDueDate: civilDateSchema, reason: z.string().trim().min(3).max(500) })
  .strict();

const renewSchema = z
  .object({
    newDueDate: civilDateSchema,
    amountCents: centsSchema.optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

/**
 * El convenio con quita exige confirmación escrita (§24.5): la quita es dinero
 * perdonado, y eso no se aprueba con un clic.
 */
const settlementSchema = z
  .object({
    agreedCents: centsSchema,
    forgivenCents: centsSchema.default('0'),
    dueOn: civilDateSchema,
    terms: z.string().trim().max(1000).optional(),
  })
  .merge(writtenConfirmationSchema)
  .strict();

/** Castigo: motivo de catálogo **y** folio teclado (§24.5). */
const writeOffSchema = reasonSchema.merge(writtenConfirmationSchema).strict();

@Controller({ path: 'admin/notes', version: '1' })
@Roles('ADMIN')
export class NotesController {
  constructor(
    private readonly issueNote: IssueNoteUseCase,
    private readonly registerPayment: RegisterPaymentUseCase,
    private readonly listNotes: ListNotesUseCase,
    private readonly getDetail: GetNoteDetailUseCase,
    private readonly simulate: SimulateSettlementUseCase,
    private readonly changeStatus: ChangeNoteStatusUseCase,
    private readonly extendNote: ExtendNoteUseCase,
    private readonly renewNote: RenewNoteUseCase,
    private readonly createSettlement: CreateSettlementUseCase,
    private readonly voidPayment: VoidPaymentUseCase,
    private readonly dispatcher: DispatchPendingService,
  ) {}

  /** Listado de la cartera: las pestañas de §19.4 son filtros sobre esta ruta. */
  @Get()
  async list(@Query() query: unknown, @CurrentActor() actor: Actor, @Req() request: Request & { traceId?: string }) {
    return this.listNotes.execute(listNotesQuerySchema.parse(query), this.contextOf(actor, request));
  }

  /** Emitir exige Idempotency-Key: un reintento no puede crear dos pagarés. */
  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  async issue(
    @Body(new ZodValidationPipe(createNoteRequestSchema)) body: CreateNoteRequest,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    const result = await this.issueNote.execute(body, this.contextOf(actor, request));
    // El aviso quedó en la transacción; ahora que confirmó, se intenta enviar.
    await this.dispatcher.dispatchPending();
    return result;
  }

  @Get(':id')
  async detail(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.getDetail.execute({ id }, this.contextOf(actor, request));
  }

  /**
   * Simulador de liquidación (§24.5): cuánto debe si paga tal día.
   *
   * Es `GET` porque no cambia nada: la cifra se recalcula cada vez, y eso es lo
   * correcto —el interés moratorio corre por día natural (§12.3).
   */
  @Get(':id/simulate')
  async simulateSettlement(
    @Param('id') id: string,
    @Query('date') date: string | undefined,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.simulate.execute(
      { noteId: id, ...(date !== undefined ? { onDate: date } : {}) },
      this.contextOf(actor, request),
    );
  }

  @Post(':id/payments')
  @UseInterceptors(IdempotencyInterceptor)
  async pay(
    @Param('id') noteId: string,
    @Body(new ZodValidationPipe(registerPaymentRequestSchema)) body: RegisterPaymentRequest,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    const result = await this.registerPayment.execute({ ...body, noteId }, this.contextOf(actor, request));
    // El aviso quedó en la transacción; ahora que confirmó, se intenta enviar.
    await this.dispatcher.dispatchPending();
    return result;
  }

  /** Anular: motivo de catálogo obligatorio e idempotencia (§11.3). */
  @Post(':id/void')
  @UseInterceptors(IdempotencyInterceptor)
  async void(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reasonSchema.strict())) body: z.infer<typeof reasonSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    const result = await this.changeStatus.execute(
      { noteId: id, action: 'void', ...body },
      this.contextOf(actor, request),
    );
    // El aviso quedó en la transacción; ahora que confirmó, se intenta enviar.
    await this.dispatcher.dispatchPending();
    return result;
  }

  /** Castigar: sale de cartera activa, pero la deuda sigue siendo exigible. */
  @Post(':id/write-off')
  @UseInterceptors(IdempotencyInterceptor)
  async writeOff(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(writeOffSchema)) body: z.infer<typeof writeOffSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    const { confirmFolio, ...reason } = body;
    return this.changeStatus.execute(
      { noteId: id, action: 'write-off', confirmFolio, ...reason },
      this.contextOf(actor, request),
    );
  }

  @Post(':id/reinstate')
  async reinstate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reasonSchema.strict())) body: z.infer<typeof reasonSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.changeStatus.execute(
      { noteId: id, action: 'reinstate', ...body },
      this.contextOf(actor, request),
    );
  }

  @Post(':id/extensions')
  async extend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(extendSchema)) body: z.infer<typeof extendSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    const result = await this.extendNote.execute({ noteId: id, ...body }, this.contextOf(actor, request));
    // El aviso quedó en la transacción; ahora que confirmó, se intenta enviar.
    await this.dispatcher.dispatchPending();
    return result;
  }

  @Post(':id/renew')
  @UseInterceptors(IdempotencyInterceptor)
  async renew(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(renewSchema)) body: z.infer<typeof renewSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    const result = await this.renewNote.execute({ noteId: id, ...body }, this.contextOf(actor, request));
    // El aviso quedó en la transacción; ahora que confirmó, se intenta enviar.
    await this.dispatcher.dispatchPending();
    return result;
  }

  @Post(':id/settlements')
  @UseInterceptors(IdempotencyInterceptor)
  async settle(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(settlementSchema)) body: z.infer<typeof settlementSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    const result = await this.createSettlement.execute({ noteId: id, ...body }, this.contextOf(actor, request));
    // El aviso quedó en la transacción; ahora que confirmó, se intenta enviar.
    await this.dispatcher.dispatchPending();
    return result;
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
