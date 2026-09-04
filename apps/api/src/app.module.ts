import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserAwareThrottlerGuard } from './shared/http/user-aware-throttler.guard.js';
import { throttlerConfigFor } from './shared/http/throttler.config.js';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.schema.js';
import { SharedModule } from './shared/shared.module.js';
import { TraceMiddleware } from './shared/http/trace.middleware.js';
import { ProblemDetailsFilter } from './shared/http/problem-details.filter.js';
import { HealthController } from './health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { JwtAuthGuard } from './shared/http/auth.guard.js';
import { UsersModule } from './modules/users/users.module.js';
import { CredentialsModule } from './modules/credentials/credentials.module.js';
import { PromissoryNotesModule } from './modules/promissory-notes/promissory-notes.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { CollectionsModule } from './modules/collections/collections.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SignaturesModule } from './modules/signatures/signatures.module.js';
import { ClientAccessModule } from './modules/client-access/client-access.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { DebtorsModule } from './modules/debtors/debtors.module.js';
import { LegalModule } from './modules/legal/legal.module.js';
import { SettlementsModule } from './modules/settlements/settlements.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { OtpModule } from './modules/otp/otp.module.js';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ENV],
      useFactory: (env: Env) =>
        throttlerConfigFor(
          env.RATE_LIMIT_AUTH_PER_15M,
          env.RATE_LIMIT_BURST_PER_MIN,
          env.RATE_LIMIT_SUSTAINED_PER_15M,
        ),
    }),
    SharedModule,
    NotificationsModule,
    MediaModule,
    CredentialsModule,
    AuthModule,
    UsersModule,
    PromissoryNotesModule,
    SettingsModule,
    DocumentsModule,
    CollectionsModule,
    ReportsModule,
    SignaturesModule,
    ClientAccessModule,
    PaymentsModule,
    DebtorsModule,
    LegalModule,
    SettlementsModule,
    AuditModule,
    OtpModule,
  ],
  controllers: [HealthController],
  providers: [
    // Guard global: sin @Public() explícito, la ruta no responde (§9.1, API5).
    // El límite de tasa va antes que la autenticación: una ráfaga no debe
    // llegar siquiera a verificar tokens (§9.1, API4).
    { provide: APP_GUARD, useClass: UserAwareThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Traducción única de error a respuesta RFC 9457 (§25.5). Sin esto, un error
    // de validación sale como 500 genérico y el cliente no sabe qué corregir.
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
