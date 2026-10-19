import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type QueryFilter } from 'mongoose';
import type { AuthIdentity } from '../../auth/auth.types.js';
import { Medium, type MediumDocument } from '../../schemas/medium.schema.js';
import type { CreateMediumDto } from './dto/create-medium.dto.js';
import type { ListMediumsQueryDto } from './dto/list-mediums-query.dto.js';
import type { UpdateMediumDto } from './dto/update-medium.dto.js';
import type {
  MediumRecord,
  MediumsPage,
  MediumsSummary,
} from './mediums.types.js';

@Injectable()
export class MediumsService {
  constructor(
    @InjectModel(Medium.name) private readonly mediumModel: Model<Medium>,
  ) {}

  async list(
    auth: AuthIdentity,
    query: ListMediumsQueryDto,
  ): Promise<MediumsPage> {
    const tenantId = this.tenantScope(auth);
    const filter: QueryFilter<Medium> = { tenantId };

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

    const [mediums, total, summary] = await Promise.all([
      this.mediumModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.mediumModel.countDocuments(filter).exec(),
      this.buildSummary(tenantId),
    ]);

    return {
      items: mediums.map((medium) => this.toRecord(medium)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async create(
    auth: AuthIdentity,
    dto: CreateMediumDto,
  ): Promise<MediumRecord> {
    const tenantId = this.tenantScope(auth);
    const nameKey = dto.name.toLowerCase();

    await this.ensureNameAvailable(tenantId, nameKey);

    const medium = await this.mediumModel.create({
      tenantId,
      name: dto.name,
      nameKey,
      status: dto.status ?? 'active',
      deletedAt: null,
    });

    return this.toRecord(medium);
  }

  async update(
    auth: AuthIdentity,
    id: string,
    dto: UpdateMediumDto,
  ): Promise<MediumRecord> {
    const tenantId = this.tenantScope(auth);
    const medium = await this.findMedium(tenantId, id);
    const updates: Record<string, unknown> = {};

    if (dto.name !== undefined && dto.name !== medium.name) {
      const nameKey = dto.name.toLowerCase();

      await this.ensureNameAvailable(tenantId, nameKey, medium._id);
      updates['name'] = dto.name;
      updates['nameKey'] = nameKey;
    }

    if (dto.status !== undefined) {
      updates['status'] = dto.status;
    }

    if (Object.keys(updates).length === 0) {
      return this.toRecord(medium);
    }

    const updated = await this.mediumModel
      .findByIdAndUpdate(
        medium._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Medium not found.');
    }

    return this.toRecord(updated);
  }

  async remove(auth: AuthIdentity, id: string): Promise<void> {
    const tenantId = this.tenantScope(auth);
    const medium = await this.findMedium(tenantId, id);

    await this.mediumModel
      .updateOne({ _id: medium._id }, { $set: { deletedAt: new Date() } })
      .exec();
  }

  async restore(auth: AuthIdentity, id: string): Promise<MediumRecord> {
    const tenantId = this.tenantScope(auth);
    const medium = await this.findDeletedMedium(tenantId, id);

    await this.ensureNameAvailable(tenantId, medium.nameKey, medium._id);

    const updated = await this.mediumModel
      .findByIdAndUpdate(
        medium._id,
        { $set: { deletedAt: null } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Medium not found.');
    }

    return this.toRecord(updated);
  }

  private tenantScope(auth: AuthIdentity): Types.ObjectId {
    if (!auth.tenantId || !Types.ObjectId.isValid(auth.tenantId)) {
      throw new UnauthorizedException('Tenant context missing.');
    }

    return new Types.ObjectId(auth.tenantId);
  }

  private async findMedium(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<MediumDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Medium not found.');
    }

    const medium = await this.mediumModel
      .findOne({ _id: id, tenantId, deletedAt: null })
      .exec();

    if (!medium) {
      throw new NotFoundException('Medium not found.');
    }

    return medium;
  }

  private async findDeletedMedium(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<MediumDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Medium not found.');
    }

    const medium = await this.mediumModel
      .findOne({ _id: id, tenantId, deletedAt: { $ne: null } })
      .exec();

    if (!medium) {
      throw new NotFoundException('Medium not found.');
    }

    return medium;
  }

  private async ensureNameAvailable(
    tenantId: Types.ObjectId,
    nameKey: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: QueryFilter<Medium> = {
      tenantId,
      nameKey,
      deletedAt: null,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    if (await this.mediumModel.exists(filter)) {
      throw new ConflictException('A medium with this name already exists.');
    }
  }

  private async buildSummary(
    tenantId: Types.ObjectId,
  ): Promise<MediumsSummary> {
    const rows = await this.mediumModel
      .aggregate<{ _id: keyof MediumsSummary; count: number }>([
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

    const summary: MediumsSummary = { active: 0, inactive: 0, deleted: 0 };

    for (const row of rows) {
      summary[row._id] += row.count;
    }

    return summary;
  }

  private toRecord(medium: MediumDocument): MediumRecord {
    const createdAt = medium.get('createdAt') as Date | undefined;
    const updatedAt = medium.get('updatedAt') as Date | undefined;

    return {
      id: medium._id.toString(),
      name: medium.name,
      status: medium.status,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
      deletedAt: medium.deletedAt ? medium.deletedAt.toISOString() : null,
    };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
