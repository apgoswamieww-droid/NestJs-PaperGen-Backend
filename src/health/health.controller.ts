import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthService, type HealthStatus } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  check(): HealthStatus {
    return this.healthService.check();
  }
}
