import { Module } from '@nestjs/common';
import { PASSWORD_HASHER } from './domain/ports/password-hasher.js';
import { PasswordService } from './infrastructure/password.service.js';

/** El único lugar donde se elige la implementación concreta. */
@Module({
  providers: [{ provide: PASSWORD_HASHER, useClass: PasswordService }],
  exports: [PASSWORD_HASHER],
})
export class CredentialsModule {}
