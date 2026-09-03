import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { LoginUseCase } from './application/login.use-case.js';
import { SessionIssuer } from './application/session-issuer.service.js';
import { RefreshSessionUseCase } from './application/refresh-session.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { TokenService } from './infrastructure/token.service.js';
import { JwtAuthGuard } from '../../shared/http/auth.guard.js';
import { CredentialsModule } from '../credentials/credentials.module.js';
import { ChangePasswordUseCase } from '../credentials/application/change-password.use-case.js';
import { OtpModule } from '../otp/otp.module.js';

@Module({
  imports: [JwtModule.register({}), CredentialsModule, OtpModule],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    SessionIssuer,
    RefreshSessionUseCase,
    LogoutUseCase,
    ChangePasswordUseCase,
    TokenService,
    JwtAuthGuard,
  ],
  exports: [TokenService, JwtAuthGuard],
})
export class AuthModule {}
