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
import {
  Standard,
  type StandardDocument,
} from '../../schemas/standard.schema.js';
import type { CreateStandardDto } from './dto/create-standard.dto.js';
import type { ListStandardsQueryDto } from './dto/list-standards-query.dto.js';
import type { UpdateStandardDto } from './dto/update-standard.dto.js';
import type {
  StandardRecord,
  StandardsPage,
  StandardsSummary,
} from './standards.types.js';

@Injectable()
export class StandardsService {
  constructor(
    @InjectModel(Standard.name)
    private readonly standardModel: Model<Standard>,
    @InjectModel(Medium.name)
    private readonly mediumModel: Model<Medium>,
  ) {}

  async list(
    auth: AuthIdentity,
    query: ListStandardsQueryDto,
  ): Promise<StandardsPage> {
    const tenantId = this.tenantScope(auth);
    const filter: QueryFilter<Standard> = { tenantId };

    if (!query.includeDeleted) {
      filter.deletedAt = null;
    }

    if (query.mediumId) {
      filter.mediumId = new Types.ObjectId(query.mediumId);
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.search) {
      filter.name = new RegExp(escapeRegex(query.search), 'i');
    }

    const sort: Record<string, 1 | -1> = {
      [query.sort]: query.dir === 'asc' ? 1 : -1,
      _id: 1,
    };

    const [standards, total, summary] = await Promise.all([
      this.standardModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.standardModel.countDocuments(filter).exec(),
      this.buildSummary(tenantId),
    ]);

    const names = await this.mediumNames(
      tenantId,
      standards.map((standard) => standard.mediumId),
    );

    return {
      items: standards.map((standard) =>
        this.toRecord(standard, names.get(standard.mediumId.toString())),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async create(
    auth: AuthIdentity,
    dto: CreateStandardDto,
  ): Promise<StandardRecord> {
    const tenantId = this.tenantScope(auth);
    const medium = await this.findMedium(tenantId, dto.mediumId);
    const nameKey = dto.name.toLowerCase();

    await this.ensureNameAvailable(tenantId, medium._id, nameKey);

    const standard = await this.standardModel.create({
      tenantId,
      mediumId: medium._id,
      name: dto.name,
      nameKey,
      order: dto.order,
      status: dto.status ?? 'active',
      deletedAt: null,
    });

    return this.toRecord(standard, medium.name);
  }

  async update(
    auth: AuthIdentity,
    id: string,
    dto: UpdateStandardDto,
  ): Promise<StandardRecord> {
    const tenantId = this.tenantScope(auth);
    const standard = await this.findStandard(tenantId, id);
    const updates: Record<string, unknown> = {};
    let mediumId = standard.mediumId;

    if (dto.mediumId !== undefined) {
      const medium = await this.findMedium(tenantId, dto.mediumId);

      mediumId = medium._id;
      updates['mediumId'] = medium._id;
    }

    if (
      dto.name !== undefined &&
      (dto.name !== standard.name || !mediumId.equals(standard.mediumId))
    ) {
      const nameKey = dto.name.toLowerCase();

      await this.ensureNameAvailable(tenantId, mediumId, nameKey, standard._id);
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
      const names = await this.mediumNames(tenantId, [standard.mediumId]);

      return this.toRecord(standard, names.get(standard.mediumId.toString()));
    }

    const updated = await this.standardModel
      .findByIdAndUpdate(
        standard._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Standard not found.');
    }

    const names = await this.mediumNames(tenantId, [updated.mediumId]);

    return this.toRecord(updated, names.get(updated.mediumId.toString()));
  }

  async remove(auth: AuthIdentity, id: string): Promise<void> {
    const tenantId = this.tenantScope(auth);
    const standard = await this.findStandard(tenantId, id);

    await this.standardModel
      .updateOne({ _id: standard._id }, { $set: { deletedAt: new Date() } })
      .exec();
  }

  async restore(auth: AuthIdentity, id: string): Promise<StandardRecord> {
    const tenantId = this.tenantScope(auth);
    const standard = await this.findDeletedStandard(tenantId, id);

    await this.ensureNameAvailable(
      tenantId,
      standard.mediumId,
      standard.nameKey,
      standard._id,
    );

    const updated = await this.standardModel
      .findByIdAndUpdate(
        standard._id,
        { $set: { deletedAt: null } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Standard not found.');
    }

    const names = await this.mediumNames(tenantId, [updated.mediumId]);

    return this.toRecord(updated, names.get(updated.mediumId.toString()));
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

  private async findStandard(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<StandardDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Standard not found.');
    }

    const standard = await this.standardModel
      .findOne({ _id: id, tenantId, deletedAt: null })
      .exec();

    if (!standard) {
      throw new NotFoundException('Standard not found.');
    }

    return standard;
  }

  private async findDeletedStandard(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<StandardDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Standard not found.');
    }

    const standard = await this.standardModel
      .findOne({ _id: id, tenantId, deletedAt: { $ne: null } })
      .exec();

    if (!standard) {
      throw new NotFoundException('Standard not found.');
    }

    return standard;
  }

  private async ensureNameAvailable(
    tenantId: Types.ObjectId,
    mediumId: Types.ObjectId,
    nameKey: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: QueryFilter<Standard> = {
      tenantId,
      mediumId,
      nameKey,
      deletedAt: null,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    if (await this.standardModel.exists(filter)) {
      throw new ConflictException(
        'A standard with this name already exists for this medium.',
      );
    }
  }

  private async mediumNames(
    tenantId: Types.ObjectId,
    mediumIds: Types.ObjectId[],
  ): Promise<Map<string, string>> {
    if (mediumIds.length === 0) {
      return new Map();
    }

    const mediums = await this.mediumModel
      .find({ _id: { $in: mediumIds }, tenantId })
      .select('name')
      .exec();

    return new Map(
      mediums.map((medium) => [medium._id.toString(), medium.name]),
    );
  }

  private async buildSummary(
    tenantId: Types.ObjectId,
  ): Promise<StandardsSummary> {
    const rows = await this.standardModel
      .aggregate<{ _id: keyof StandardsSummary; count: number }>([
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

    const summary: StandardsSummary = { active: 0, inactive: 0, deleted: 0 };

    for (const row of rows) {
      summary[row._id] += row.count;
    }

    return summary;
  }

  private toRecord(
    standard: StandardDocument,
    mediumName: string | undefined,
  ): StandardRecord {
    const createdAt = standard.get('createdAt') as Date | undefined;
    const updatedAt = standard.get('updatedAt') as Date | undefined;

    return {
      id: standard._id.toString(),
      name: standard.name,
      mediumId: standard.mediumId.toString(),
      mediumName: mediumName ?? 'Unknown',
      order: standard.order,
      status: standard.status,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
      deletedAt: standard.deletedAt ? standard.deletedAt.toISOString() : null,
    };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
