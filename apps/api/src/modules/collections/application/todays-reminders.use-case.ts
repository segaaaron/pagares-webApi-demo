import { Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { businessToday } from '@pagares/domain-rules';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { SendReminderUseCase } from './send-reminder.use-case.js';
import {
  ReminderCandidatesService,
  type ReminderCandidate,
} from './reminder-candidates.service.js';

export interface TodaysRemindersPreview {
  date: string;
  pending: ReminderCandidate[];
  alreadySent: ReminderCandidate[];
}

export interface TodaysRemindersResult {
  date: string;
  intentados: number;
  enviados: number;
  yaEstaban: number;
  fallidos: number;
  /** El motivo del primer fallo: sin él, «no salió» no dice qué arreglar. */
  primerError: string | null;
}

/**
 * Qué avisos tocan hoy, sin mandar nada (§13.1).
 *
 * Va antes del envío a propósito: un botón que manda treinta correos sin
 * enseñar antes a quién es un botón que nadie pulsa con tranquilidad.
 */
@Injectable()
export class TodaysRemindersUseCase extends BaseUseCase<
  Record<string, never>,
  TodaysRemindersPreview
> {
  constructor(
    private readonly candidates: ReminderCandidatesService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(TodaysRemindersUseCase.name));
  }

  protected async handle(): Promise<TodaysRemindersPreview> {
    const today = businessToday(this.clock.now());
    const candidatos = await this.candidates.forDate(today);

    return {
      date: today,
      pending: candidatos.filter((candidato) => !candidato.alreadySentToday),
      // Los ya enviados siguen listados: saber que salieron es parte de la
      // respuesta, y esconderlos haría parecer que hoy no tocaba nada.
      alreadySent: candidatos.filter((candidato) => candidato.alreadySentToday),
    };
  }
}

/**
 * Manda los avisos del día, todos (§13.1, §18).
 *
 * Avisar exigía entrar pagaré por pagaré: con treinta vencimientos, treinta
 * viajes. Esto los reúne sin cambiar quién decide qué se manda —la regla del
 * tramo sigue eligiendo plantilla— ni cuándo ocurre: lo dispara el
 * administrador desde su bandeja.
 *
 * Repetirlo el mismo día no duplica nada, y no lo garantiza este bucle sino la
 * clave única (pagaré, regla, día) de `ReminderLog`.
 */
@Injectable()
export class SendTodaysRemindersUseCase extends BaseUseCase<
  Record<string, never>,
  TodaysRemindersResult
> {
  constructor(
    private readonly candidates: ReminderCandidatesService,
    private readonly sendReminder: SendReminderUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(SendTodaysRemindersUseCase.name));
  }

  protected async handle(
    _input: Record<string, never>,
    ctx: ExecutionContext,
  ): Promise<TodaysRemindersResult> {
    const today = businessToday(this.clock.now());
    const candidatos = await this.candidates.forDate(today);

    let enviados = 0;
    let yaEstaban = 0;
    let fallidos = 0;
    let primerError: string | null = null;

    for (const candidato of candidatos) {
      try {
        // Se delega en el envío de uno: la elección de plantilla, la bitácora y
        // la idempotencia viven ahí, y duplicarlas aquí sería tener dos reglas.
        const resultado = await this.sendReminder.execute({ noteId: candidato.noteId }, ctx);
        if (resultado.alreadySentToday) yaEstaban += 1;
        else enviados += 1;
      } catch (error) {
        // Un pagaré que falla no puede parar a los otros veintinueve.
        fallidos += 1;
        primerError ??= error instanceof Error ? error.message : String(error);
      }
    }

    return { date: today, intentados: candidatos.length, enviados, yaEstaban, fallidos, primerError };
  }
}
