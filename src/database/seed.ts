import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AppModule } from '../app.module.js';
import { PasswordService } from '../auth/password.service.js';
import { PlatformAdmin } from '../schemas/platform-admin.schema.js';
import { Tenant } from '../schemas/tenant.schema.js';
import { User } from '../schemas/user.schema.js';

interface SeedAccount {
  name: string;
  email: string;
  password: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable ${name} for seeding.`,
    );
  }

  return value;
}

function accountFromEnv(prefix: string): SeedAccount {
  const account = {
    name: requiredEnv(`SEED_${prefix}_NAME`),
    email: requiredEnv(`SEED_${prefix}_EMAIL`).toLowerCase(),
    password: requiredEnv(`SEED_${prefix}_PASSWORD`),
  };

  if (account.password.length < 8) {
    throw new Error(
      `Seed password for ${account.email} must be at least 8 characters.`,
    );
  }

  return account;
}

async function seed(): Promise<void> {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const tenantModel = app.get<Model<Tenant>>(getModelToken(Tenant.name));
    const userModel = app.get<Model<User>>(getModelToken(User.name));
    const adminModel = app.get<Model<PlatformAdmin>>(
      getModelToken(PlatformAdmin.name),
    );
    const passwordService = app.get(PasswordService);

    const tenantName = requiredEnv('SEED_TENANT_NAME');
    const tenantSlug = requiredEnv('SEED_TENANT_SLUG').toLowerCase();
    const schoolAdmin = accountFromEnv('SCHOOL_ADMIN');
    const platformAdmin = accountFromEnv('PLATFORM_ADMIN');

    const tenant = await tenantModel
      .findOneAndUpdate(
        { slug: tenantSlug },
        {
          $set: {
            name: tenantName,
            type: 'school',
            phone: '+91 98765 43210',
            email: 'office@demo.school',
            website: 'https://demo.school',
            addressLine1: '12 Vidya Marg',
            addressLine2: 'Civil Lines',
            city: 'Nagpur',
            state: 'Maharashtra',
            pincode: '440001',
            country: 'India',
            tagline: 'Exam-ready question papers, generated in minutes.',
            brandColor: '#73113a',
            board: 'cbse',
            affiliationNumber: 'CBSE/3300123',
            principalName: 'Dr. Asha Deshmukh',
            academicYear: '2025-26',
            timezone: 'Asia/Kolkata',
          },
          $setOnInsert: { status: 'active', plan: 'starter' },
        },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    if (!tenant) {
      throw new Error('Failed to upsert the seed tenant.');
    }

    logger.log(`Tenant ready: ${tenant._id.toString()} (${tenant.slug})`);

    const existingUser = await userModel
      .findOne({ email: schoolAdmin.email })
      .exec();

    if (existingUser) {
      logger.warn(
        `School admin ${schoolAdmin.email} already exists - password left unchanged.`,
      );
    } else {
      await userModel.create({
        tenantId: tenant._id,
        email: schoolAdmin.email,
        name: schoolAdmin.name,
        role: 'school_admin',
        passwordHash: await passwordService.hash(schoolAdmin.password),
        status: 'active',
      });
      logger.log(`School admin created: ${schoolAdmin.email}`);
    }

    const existingAdmin = await adminModel
      .findOne({ email: platformAdmin.email })
      .exec();

    if (existingAdmin) {
      logger.warn(
        `Platform admin ${platformAdmin.email} already exists - password left unchanged.`,
      );
    } else {
      await adminModel.create({
        email: platformAdmin.email,
        name: platformAdmin.name,
        role: 'super_admin',
        passwordHash: await passwordService.hash(platformAdmin.password),
        status: 'active',
      });
      logger.log(`Platform admin created: ${platformAdmin.email}`);
    }
  } finally {
    await app.close();
  }
}

try {
  await seed();
} catch (error) {
  Logger.error(
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined,
    'Seed',
  );
  process.exitCode = 1;
}
