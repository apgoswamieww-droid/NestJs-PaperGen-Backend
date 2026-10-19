import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

let app: INestApplication;
let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergenerator-test');

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

describe('API (e2e)', () => {
  it('GET /api/health reports a live database', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      database: 'up',
      uptime: expect.any(Number),
    });
  });

  it('GET /api returns the root greeting', async () => {
    await request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('GET /api is not mounted at the bare root', async () => {
    await request(app.getHttpServer()).get('/').expect(404);
  });
});
