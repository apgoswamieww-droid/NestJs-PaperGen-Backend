import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import mongoose from 'mongoose';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  uptime: number;
}

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: mongoose.Connection,
  ) {}

  check(): HealthStatus {
    const database = this.connection.readyState === 1 ? 'up' : 'down';

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptime: Math.round(process.uptime()),
    };
  }
}
