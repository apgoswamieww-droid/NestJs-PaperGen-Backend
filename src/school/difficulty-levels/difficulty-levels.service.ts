import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type QueryFilter } from 'mongoose';
import type { AuthIdentity } from '../../auth/auth.types.js';
import {
  DifficultyLevel,
  type DifficultyLevelDocument,
} from '../../schemas/difficulty-level.schema.js';
import type { CreateDifficultyLevelDto } from './dto/create-difficulty-level.dto.js';
import type { ListDifficultyLevelsQueryDto } from './dto/list-difficulty-levels-query.dto.js';
import type { UpdateDifficultyLevelDto } from './dto/update-difficulty-level.dto.js';
import type {
  DifficultyLevelRecord,
  DifficultyLevelsPage,
  DifficultyLevelsSummary,
} from './difficulty-levels.types.js';

@Injectable()
export class DifficultyLevelsService {
  constructor(
    @InjectModel(DifficultyLevel.name)
    private readonly difficultyLevelModel: Model<DifficultyLevel>,
  ) {}

  async list(
    auth: AuthIdentity,
    query: ListDifficultyLevelsQueryDto,
  ): Promise<DifficultyLevelsPage> {
    const tenantId = this.tenantScope(auth);
    const filter: QueryFilter<DifficultyLevel> = { tenantId };

    if (!query.includeDeleted) {
      filter.deletedAt = null;
    }

    if (query.search) {
      filter.name = new RegExp(escapeRegex(query.search), 'i');
    }

    if (query.status) {
      filter.status = query.status;
    }

    const sort: Record<string, 1 | -1> = {
      [query.sort]: query.dir === 'asc' ? 1 : -1,
      _id: 1,
    };

    const [difficultyLevels, total, summary] = await Promise.all([
      this.difficultyLevelModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.difficultyLevelModel.countDocuments(filter).exec(),
      this.buildSummary(tenantId),
    ]);

    return {
      items: difficultyLevels.map((difficultyLevel) =>
        this.toRecord(difficultyLevel),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async create(
    auth: AuthIdentity,
    dto: CreateDifficultyLevelDto,
  ): Promise<DifficultyLevelRecord> {
    const tenantId = this.tenantScope(auth);
    const nameKey = dto.name.toLowerCase();

    await this.ensureNameAvailable(tenantId, nameKey);

    const difficultyLevel = await this.difficultyLevelModel.create({
      tenantId,
      name: dto.name,
      nameKey,
      order: dto.order,
      status: dto.status ?? 'active',
      deletedAt: null,
    });

    return this.toRecord(difficultyLevel);
  }

  async update(
    auth: AuthIdentity,
    id: string,
    dto: UpdateDifficultyLevelDto,
  ): Promise<DifficultyLevelRecord> {
    const tenantId = this.tenantScope(auth);
    const difficultyLevel = await this.findDifficultyLevel(tenantId, id);
    const updates: Record<string, unknown> = {};

    if (dto.name !== undefined && dto.name !== difficultyLevel.name) {
      const nameKey = dto.name.toLowerCase();

      await this.ensureNameAvailable(tenantId, nameKey, difficultyLevel._id);
      updates['name'] = dto.name;
      updates['nameKey'] = nameKey;
    }

    if (dto.order !== undefined) {
      updates['order'] = dto.order;
    }

    if (dto.status !== undefined) {
      updates['status'] = dto.status;
    }

    if (Object.keys(updates).length === 0) {
      return this.toRecord(difficultyLevel);
    }

    const updated = await this.difficultyLevelModel
      .findByIdAndUpdate(
        difficultyLevel._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Difficulty level not found.');
    }

    return this.toRecord(updated);
  }

  async remove(auth: AuthIdentity, id: string): Promise<void> {
    const tenantId = this.tenantScope(auth);
    const difficultyLevel = await this.findDifficultyLevel(tenantId, id);

    await this.difficultyLevelModel
      .updateOne(
        { _id: difficultyLevel._id },
        { $set: { deletedAt: new Date() } },
      )
      .exec();
  }

  async restore(
    auth: AuthIdentity,
    id: string,
  ): Promise<DifficultyLevelRecord> {
    const tenantId = this.tenantScope(auth);
    const difficultyLevel = await this.findDeletedDifficultyLevel(tenantId, id);

    await this.ensureNameAvailable(
      tenantId,
      difficultyLevel.nameKey,
      difficultyLevel._id,
    );

    const updated = await this.difficultyLevelModel
      .findByIdAndUpdate(
        difficultyLevel._id,
        { $set: { deletedAt: null } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Difficulty level not found.');
    }

    return this.toRecord(updated);
  }

  private tenantScope(auth: AuthIdentity): Types.ObjectId {
    if (!auth.tenantId || !Types.ObjectId.isValid(auth.tenantId)) {
      throw new UnauthorizedException('Tenant context missing.');
    }

    return new Types.ObjectId(auth.tenantId);
  }

  private async findDifficultyLevel(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<DifficultyLevelDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Difficulty level not found.');
    }

    const difficultyLevel = await this.difficultyLevelModel
      .findOne({ _id: id, tenantId, deletedAt: null })
      .exec();

    if (!difficultyLevel) {
      throw new NotFoundException('Difficulty level not found.');
    }

    return difficultyLevel;
  }

  private async findDeletedDifficultyLevel(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<DifficultyLevelDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Difficulty level not found.');
    }

    const difficultyLevel = await this.difficultyLevelModel
      .findOne({ _id: id, tenantId, deletedAt: { $ne: null } })
      .exec();

    if (!difficultyLevel) {
      throw new NotFoundException('Difficulty level not found.');
    }

    return difficultyLevel;
  }

  private async ensureNameAvailable(
    tenantId: Types.ObjectId,
    nameKey: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: QueryFilter<DifficultyLevel> = {
      tenantId,
      nameKey,
      deletedAt: null,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    if (await this.difficultyLevelModel.exists(filter)) {
      throw new ConflictException(
        'A difficulty level with this name already exists.',
      );
    }
  }

  private async buildSummary(
    tenantId: Types.ObjectId,
  ): Promise<DifficultyLevelsSummary> {
    const rows = await this.difficultyLevelModel
      .aggregate<{ _id: keyof DifficultyLevelsSummary; count: number }>([
        { $match: { tenantId } },
        {
          $group: {
            _id: {
              $cond: [{ $eq: ['$deletedAt', null] }, '$status', 'deleted'],
            },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    const summary: DifficultyLevelsSummary = {
      active: 0,
      inactive: 0,
      deleted: 0,
    };

    for (const row of rows) {
      summary[row._id] += row.count;
    }

    return summary;
  }

  private toRecord(
    difficultyLevel: DifficultyLevelDocument,
  ): DifficultyLevelRecord {
    const createdAt = difficultyLevel.get('createdAt') as Date | undefined;
    const updatedAt = difficultyLevel.get('updatedAt') as Date | undefined;

    return {
      id: difficultyLevel._id.toString(),
      name: difficultyLevel.name,
      order: difficultyLevel.order,
      status: difficultyLevel.status,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
      deletedAt: difficultyLevel.deletedAt
        ? difficultyLevel.deletedAt.toISOString()
        : null,
    };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
