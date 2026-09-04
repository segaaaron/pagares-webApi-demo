import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller.js';
import { CollectionStageController } from './collection-stage.controller.js';
import { ReminderRulesController } from './reminder-rules.controller.js';
import { NoteRemindersController } from './note-reminders.controller.js';
import { TodaysRemindersController } from './todays-reminders.controller.js';
import { RegisterActivityUseCase } from './application/register-activity.use-case.js';
import { ChangeCollectionStageUseCase } from './application/change-collection-stage.use-case.js';
import {
  ListReminderRulesUseCase,
  ReplaceReminderRulesUseCase,
} from './application/reminder-rules.use-case.js';
import { PreviewReminderUseCase } from './application/preview-reminder.use-case.js';
import { SendReminderUseCase } from './application/send-reminder.use-case.js';
import { TodaysRemindersUseCase } from './application/todays-reminders.use-case.js';
import { REMINDER_RULES } from './domain/ports/reminder-rule.repository.js';
import { PrismaReminderRuleRepository } from './infrastructure/prisma-reminder-rule.repository.js';

/**
 * Cobranza (§3.1): reglas de recordatorio, tramos de gestión y bitácora de
 * contactos. **Decide** qué se avisa y cuándo; entregar el mensaje es de
 * `notifications`, que escucha el evento.
 */
@Module({
  controllers: [
    CollectionsController,
    CollectionStageController,
    ReminderRulesController,
    NoteRemindersController,
    TodaysRemindersController,
  ],
  providers: [
    RegisterActivityUseCase,
    ChangeCollectionStageUseCase,
    ListReminderRulesUseCase,
    ReplaceReminderRulesUseCase,
    PreviewReminderUseCase,
    SendReminderUseCase,
    TodaysRemindersUseCase,
    { provide: REMINDER_RULES, useClass: PrismaReminderRuleRepository },
  ],
  exports: [SendReminderUseCase],
})
export class CollectionsModule {}
