import { Global, Module } from '@nestjs/common';
import { CLOCK, SystemClock, UNIT_OF_WORK } from '@pagares/api-core';
import { PrismaService } from './persistence/prisma.service.js';
import { PrismaUnitOfWork } from './persistence/prisma-unit-of-work.js';
import { AuditService } from './persistence/audit.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    AuditService,
    { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork },
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [PrismaService, AuditService, UNIT_OF_WORK, CLOCK],
})
export class SharedModule {}
