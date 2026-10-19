import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

let app: INestApplication;
let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-throttle-test');
  process.env['JWT_APP_ACCESS_SECRET'] =
    'throttle-app-secret-0123456789abcdefghijklmnop';
  process.env['JWT_ADMIN_ACCESS_SECRET'] =
    'throttle-admin-secret-0123456789abcdefghijkl';
  process.env['THROTTLE_LIMIT'] = '3';
  process.env['THROTTLE_TTL_SECONDS'] = '60';

  const { AppModule } = await import('./../src/app.module.js');
  const { configureApp } = await import('./../src/configure-app.js');

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = configureApp(moduleFixture.createNestApplication());
  await app.init();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('Auth throttling (e2e)', () => {
  it('blocks repeated login attempts with 429 without affecting other routes', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@demo.school', password: 'WrongPassword1' })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody@demo.school', password: 'WrongPassword1' })
      .expect(429);

    // Throttling is scoped to auth controllers only.
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });
});
