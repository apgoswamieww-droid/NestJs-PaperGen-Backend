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
import { PermissionsModule } from './auth/permissions.module.js';
import { BloomLevelsModule } from './school/bloom-levels/bloom-levels.module.js';
import {
  appConfig,
  authConfig,
  databaseConfig,
  mailConfig,
} from './config/configuration.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { ChaptersModule } from './school/chapters/chapters.module.js';
import { DifficultyLevelsModule } from './school/difficulty-levels/difficulty-levels.module.js';
import { ExamTypesModule } from './school/exam-types/exam-types.module.js';
import { MediumsModule } from './school/mediums/mediums.module.js';
import { QuestionTypesModule } from './school/question-types/question-types.module.js';
import { QuestionsModule } from './school/questions/questions.module.js';
import { RolesModule } from './school/roles/roles.module.js';
import { StandardsModule } from './school/standards/standards.module.js';
import { SubjectsModule } from './school/subjects/subjects.module.js';
import { TopicsModule } from './school/topics/topics.module.js';
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
    PermissionsModule,
    AuthModule,
    AdminAuthModule,
    AdminSchoolsModule,
    AdminPlansModule,
    SchoolUsersModule,
    RolesModule,
    MediumsModule,
    StandardsModule,
    SubjectsModule,
    ChaptersModule,
    TopicsModule,
    QuestionTypesModule,
    QuestionsModule,
    DifficultyLevelsModule,
    BloomLevelsModule,
    ExamTypesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
