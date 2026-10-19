import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Plan, type PlanDocument } from '../../schemas/plan.schema.js';
import { Tenant } from '../../schemas/tenant.schema.js';
import { slugify, withSlugSuffix } from '../schools/slug.js';
import type { AdminPlan } from './admin-plans.types.js';
import type { CreatePlanDto } from './dto/create-plan.dto.js';
import type { UpdatePlanDto } from './dto/update-plan.dto.js';

const MAX_CODE_ATTEMPTS = 25;

const DEFAULT_PLANS = [
  {
    code: 'starter',
    name: 'Starter',
    tagline: 'For single schools getting started.',
    monthlyPrice: 3999,
    annualPrice: 39990,
    features: [
      'Up to 300 students',
      '1 admin + 10 teachers',
      'Blueprints & question bank',
      'Email support',
    ],
    limits: { maxStudents: 300, maxTeachers: 10, maxTotalUsers: null },
    featured: false,
    active: true,
    sortOrder: 1,
  },
  {
    code: 'growth',
    name: 'Growth',
    tagline: 'For growing schools and institutes.',
    monthlyPrice: 8999,
    annualPrice: 89990,
    features: [
      'Up to 1,200 students',
      'Unlimited teachers',
      'White-label login',
      'Priority support',
    ],
    limits: { maxStudents: 1200, maxTeachers: null, maxTotalUsers: null },
    featured: true,
    active: true,
    sortOrder: 2,
  },
  {
    code: 'scale',
    name: 'Scale',
    tagline: 'For groups and multi-campus institutions.',
    monthlyPrice: null,
    annualPrice: null,
    features: [
      'Unlimited students',
      'Multiple campuses',
      'SSO & audit logs',
      'Dedicated success manager',
    ],
    limits: { maxStudents: null, maxTeachers: null, maxTotalUsers: null },
    featured: false,
    active: true,
    sortOrder: 3,
  },
];

@Injectable()
export class AdminPlansService implements OnModuleInit {
  private readonly logger = new Logger(AdminPlansService.name);

  constructor(
    @InjectModel(Plan.name) private readonly planModel: Model<Plan>,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<Tenant>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const plan of DEFAULT_PLANS) {
      await this.planModel
        .updateOne(
          { code: plan.code },
          { $setOnInsert: plan },
          { upsert: true },
        )
        .exec();
    }

    this.logger.log('Plan catalogue ensured.');
  }

  async list(): Promise<AdminPlan[]> {
    const [plans, counts] = await Promise.all([
      this.planModel.find().sort({ sortOrder: 1, name: 1 }).exec(),
      this.tenantModel
        .aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$plan', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const countByCode = new Map(
      counts.map((entry) => [entry._id, entry.count]),
    );

    return plans.map((plan) =>
      this.toPlan(plan, countByCode.get(plan.code) ?? 0),
    );
  }

  async detail(code: string): Promise<AdminPlan> {
    const plan = await this.findPlan(code);
    const tenantCount = await this.tenantModel
      .countDocuments({ plan: plan.code })
      .exec();

    return this.toPlan(plan, tenantCount);
  }

  async create(dto: CreatePlanDto): Promise<AdminPlan> {
    const code = await this.pickCode(dto.name);

    try {
      const plan = await this.planModel.create({
        code,
        name: dto.name,
        tagline: dto.tagline ?? '',
        monthlyPrice: dto.monthlyPrice ?? null,
        annualPrice: dto.annualPrice ?? null,
        features: dto.features ?? [],
        limits: {
          maxStudents: dto.maxStudents ?? null,
          maxTeachers: dto.maxTeachers ?? null,
          maxTotalUsers: dto.maxTotalUsers ?? null,
        },
        featured: dto.featured ?? false,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
      });

      return this.toPlan(plan, 0);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          'A plan with a similar name already exists.',
        );
      }

      throw error;
    }
  }

  async update(code: string, dto: UpdatePlanDto): Promise<AdminPlan> {
    const plan = await this.findPlan(code);
    const updates: Record<string, unknown> = {};

    for (const field of [
      'name',
      'tagline',
      'monthlyPrice',
      'annualPrice',
      'features',
      'featured',
      'active',
      'sortOrder',
    ] as const) {
      if (dto[field] !== undefined) {
        updates[field] = dto[field];
      }
    }

    for (const limit of [
      'maxStudents',
      'maxTeachers',
      'maxTotalUsers',
    ] as const) {
      if (dto[limit] !== undefined) {
        updates[`limits.${limit}`] = dto[limit];
      }
    }

    const updated = await this.planModel
      .findByIdAndUpdate(
        plan._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Plan not found.');
    }

    const tenantCount = await this.tenantModel
      .countDocuments({ plan: updated.code })
      .exec();

    return this.toPlan(updated, tenantCount);
  }

  async remove(code: string): Promise<void> {
    const plan = await this.findPlan(code);
    const tenantCount = await this.tenantModel
      .countDocuments({ plan: plan.code })
      .exec();

    if (tenantCount > 0) {
      throw new ConflictException(
        `${tenantCount} school${tenantCount === 1 ? ' is' : 's are'} on this plan. Move them to another plan first.`,
      );
    }

    await this.planModel.deleteOne({ _id: plan._id }).exec();
  }

  private async findPlan(code: string): Promise<PlanDocument> {
    const plan = await this.planModel
      .findOne({ code: code.trim().toLowerCase() })
      .exec();

    if (!plan) {
      throw new NotFoundException('Plan not found.');
    }

    return plan;
  }

  private async pickCode(name: string): Promise<string> {
    const base = slugify(name);

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      const candidate = withSlugSuffix(base, attempt);

      if (!(await this.planModel.exists({ code: candidate }))) {
        return candidate;
      }
    }

    throw new ConflictException(
      'Too many plans share a similar name. Please choose a different name.',
    );
  }

  private toPlan(plan: PlanDocument, tenantCount: number): AdminPlan {
    const createdAt = plan.get('createdAt') as Date | undefined;
    const updatedAt = plan.get('updatedAt') as Date | undefined;

    return {
      code: plan.code,
      name: plan.name,
      tagline: plan.tagline ?? '',
      monthlyPrice: plan.monthlyPrice ?? null,
      annualPrice: plan.annualPrice ?? null,
      features: plan.features ?? [],
      limits: {
        maxStudents: plan.limits?.maxStudents ?? null,
        maxTeachers: plan.limits?.maxTeachers ?? null,
        maxTotalUsers: plan.limits?.maxTotalUsers ?? null,
      },
      featured: plan.featured ?? false,
      active: plan.active ?? true,
      sortOrder: plan.sortOrder ?? 0,
      tenantCount,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
    };
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}
