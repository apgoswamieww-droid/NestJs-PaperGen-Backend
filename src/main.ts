import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('app.port');
  const apiPrefix = configService.getOrThrow<string>('app.apiPrefix');

  await app.listen(port);

  Logger.log(`API ready at http://localhost:${port}/${apiPrefix}`, 'Bootstrap');
}

await bootstrap();
