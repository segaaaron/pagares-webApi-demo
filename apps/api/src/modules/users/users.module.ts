import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { CreateUserUseCase } from './application/create-user.use-case.js';
import { ManageUserUseCase } from './application/manage-user.use-case.js';
import { AuthModule } from '../auth/auth.module.js';
import { CredentialsModule } from '../credentials/credentials.module.js';
import { CLIENT_ACCOUNT_PROVISIONER } from '../promissory-notes/domain/ports/client-account.js';
import { PrismaClientAccountProvisioner } from './infrastructure/prisma-client-account.provisioner.js';

@Module({
  imports: [AuthModule, CredentialsModule],
  controllers: [UsersController],
  providers: [
    CreateUserUseCase,
    ManageUserUseCase,
    // Crear cuentas es responsabilidad de este módulo; la emisión sólo pide el
    // puerto (§3.2). Por eso el binding vive aquí y se exporta el símbolo.
    { provide: CLIENT_ACCOUNT_PROVISIONER, useClass: PrismaClientAccountProvisioner },
  ],
  exports: [CLIENT_ACCOUNT_PROVISIONER],
})
export class UsersModule {}
