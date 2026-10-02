import { Controller, Get } from '@nestjs/common';

export interface HealthReport {
  status: 'ok';
  service: 'boasis-server';
}

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthReport {
    return { status: 'ok', service: 'boasis-server' };
  }
}
