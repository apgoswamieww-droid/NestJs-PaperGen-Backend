import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { json, type Express } from 'express';
import helmet from 'helmet';

export function configureApp<T>(app: INestApplication<T>): INestApplication<T> {
  const configService = app.get(ConfigService);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Required for secure cookies when the API sits behind a reverse proxy.
  if (configService.get<boolean>('app.trustProxy')) {
    (app.getHttpAdapter().getInstance() as Express).set('trust proxy', true);
  }

  app.use(cookieParser());
  app.use(json({ limit: '3mb' }));

  app.enableCors({
    origin: configService.get<string[]>('app.corsOrigins'),
    credentials: true,
  });

  app.setGlobalPrefix(configService.getOrThrow<string>('app.apiPrefix'));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  return app;
}
