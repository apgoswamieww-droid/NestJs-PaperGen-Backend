import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminAuthModule } from './admin/auth/admin-auth.module.js';
import { AdminPlansModule } from './admin/plans/admin-plans.module.js';
import { AdminSchoolsModule } from './admin/schools/admin-schools.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import {
  appConfig,
  authConfig,
  databaseConfig,
  mailConfig,
} from './config/configuration.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { MediumsModule } from './school/mediums/mediums.module.js';
import { StandardsModule } from './school/standards/standards.module.js';
import { SchoolUsersModule } from './school/users/school-users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig, authConfig, mailConfig],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl:
              configService.getOrThrow<number>('app.throttleTtlSeconds') * 1000,
            limit: configService.getOrThrow<number>('app.throttleLimit'),
          },
        ],
      }),
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('database.uri'),
        serverSelectionTimeoutMS: 5_000,
        autoIndex: configService.get<boolean>('app.isProduction')
          ? false
          : true,
      }),
    }),
    HealthModule,
    AuthModule,
    AdminAuthModule,
    AdminSchoolsModule,
    AdminPlansModule,
    SchoolUsersModule,
    MediumsModule,
    StandardsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
