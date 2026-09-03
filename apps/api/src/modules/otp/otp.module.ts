import { Module } from '@nestjs/common';
import { OTP_ISSUER } from './domain/ports/otp-issuer.js';
import { OtpService } from './infrastructure/otp.service.js';
import { CredentialsModule } from '../credentials/credentials.module.js';

/** Único lugar donde se elige la implementación concreta del OTP. */
@Module({
  imports: [CredentialsModule],
  providers: [{ provide: OTP_ISSUER, useClass: OtpService }],
  exports: [OTP_ISSUER],
})
export class OtpModule {}
