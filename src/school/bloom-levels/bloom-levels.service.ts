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
  BloomLevel,
  type BloomLevelDocument,
} from '../../schemas/bloom-level.schema.js';
import type { CreateBloomLevelDto } from './dto/create-bloom-level.dto.js';
import type { ListBloomLevelsQueryDto } from './dto/list-bloom-levels-query.dto.js';
import type { UpdateBloomLevelDto } from './dto/update-bloom-level.dto.js';
import type {
  BloomLevelRecord,
  BloomLevelsPage,
  BloomLevelsSummary,
} from './bloom-levels.types.js';

@Injectable()
export class BloomLevelsService {
  constructor(
    @InjectModel(BloomLevel.name)
    private readonly bloomLevelModel: Model<BloomLevel>,
  ) {}

  async list(
    auth: AuthIdentity,
    query: ListBloomLevelsQueryDto,
  ): Promise<BloomLevelsPage> {
    const tenantId = this.tenantScope(auth);
    const filter: QueryFilter<BloomLevel> = { tenantId };

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

    const [bloomLevels, total, summary] = await Promise.all([
      this.bloomLevelModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.bloomLevelModel.countDocuments(filter).exec(),
      this.buildSummary(tenantId),
    ]);

    return {
      items: bloomLevels.map((bloomLevel) => this.toRecord(bloomLevel)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async create(
    auth: AuthIdentity,
    dto: CreateBloomLevelDto,
  ): Promise<BloomLevelRecord> {
    const tenantId = this.tenantScope(auth);
    const nameKey = dto.name.toLowerCase();

    await this.ensureNameAvailable(tenantId, nameKey);

    const bloomLevel = await this.bloomLevelModel.create({
      tenantId,
      name: dto.name,
      nameKey,
      order: dto.order,
      status: dto.status ?? 'active',
      deletedAt: null,
    });

    return this.toRecord(bloomLevel);
  }

  async update(
    auth: AuthIdentity,
    id: string,
    dto: UpdateBloomLevelDto,
  ): Promise<BloomLevelRecord> {
    const tenantId = this.tenantScope(auth);
    const bloomLevel = await this.findBloomLevel(tenantId, id);
    const updates: Record<string, unknown> = {};

    if (dto.name !== undefined && dto.name !== bloomLevel.name) {
      const nameKey = dto.name.toLowerCase();

      await this.ensureNameAvailable(tenantId, nameKey, bloomLevel._id);
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
      return this.toRecord(bloomLevel);
    }

    const updated = await this.bloomLevelModel
      .findByIdAndUpdate(
        bloomLevel._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Bloom level not found.');
    }

    return this.toRecord(updated);
  }

  async remove(auth: AuthIdentity, id: string): Promise<void> {
    const tenantId = this.tenantScope(auth);
    const bloomLevel = await this.findBloomLevel(tenantId, id);

    await this.bloomLevelModel
      .updateOne({ _id: bloomLevel._id }, { $set: { deletedAt: new Date() } })
      .exec();
  }

  async restore(auth: AuthIdentity, id: string): Promise<BloomLevelRecord> {
    const tenantId = this.tenantScope(auth);
    const bloomLevel = await this.findDeletedBloomLevel(tenantId, id);

    await this.ensureNameAvailable(
      tenantId,
      bloomLevel.nameKey,
      bloomLevel._id,
    );

    const updated = await this.bloomLevelModel
      .findByIdAndUpdate(
        bloomLevel._id,
        { $set: { deletedAt: null } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Bloom level not found.');
    }

    return this.toRecord(updated);
  }

  private tenantScope(auth: AuthIdentity): Types.ObjectId {
    if (!auth.tenantId || !Types.ObjectId.isValid(auth.tenantId)) {
      throw new UnauthorizedException('Tenant context missing.');
    }

    return new Types.ObjectId(auth.tenantId);
  }

  private async findBloomLevel(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<BloomLevelDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Bloom level not found.');
    }

    const bloomLevel = await this.bloomLevelModel
      .findOne({ _id: id, tenantId, deletedAt: null })
      .exec();

    if (!bloomLevel) {
      throw new NotFoundException('Bloom level not found.');
    }

    return bloomLevel;
  }

  private async findDeletedBloomLevel(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<BloomLevelDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Bloom level not found.');
    }

    const bloomLevel = await this.bloomLevelModel
      .findOne({ _id: id, tenantId, deletedAt: { $ne: null } })
      .exec();

    if (!bloomLevel) {
      throw new NotFoundException('Bloom level not found.');
    }

    return bloomLevel;
  }

  private async ensureNameAvailable(
    tenantId: Types.ObjectId,
    nameKey: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: QueryFilter<BloomLevel> = {
      tenantId,
      nameKey,
      deletedAt: null,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    if (await this.bloomLevelModel.exists(filter)) {
      throw new ConflictException(
        'A bloom level with this name already exists.',
      );
    }
  }

  private async buildSummary(
    tenantId: Types.ObjectId,
  ): Promise<BloomLevelsSummary> {
    const rows = await this.bloomLevelModel
      .aggregate<{ _id: keyof BloomLevelsSummary; count: number }>([
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

    const summary: BloomLevelsSummary = {
      active: 0,
      inactive: 0,
      deleted: 0,
    };

    for (const row of rows) {
      summary[row._id] += row.count;
    }

    return summary;
  }

  private toRecord(bloomLevel: BloomLevelDocument): BloomLevelRecord {
    const createdAt = bloomLevel.get('createdAt') as Date | undefined;
    const updatedAt = bloomLevel.get('updatedAt') as Date | undefined;

    return {
      id: bloomLevel._id.toString(),
      name: bloomLevel.name,
      order: bloomLevel.order,
      status: bloomLevel.status,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
      deletedAt: bloomLevel.deletedAt
        ? bloomLevel.deletedAt.toISOString()
        : null,
    };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
