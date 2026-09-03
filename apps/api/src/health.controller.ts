import { Controller, Get } from '@nestjs/common';
import { Public } from './shared/http/auth.guard.js';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Public()
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
