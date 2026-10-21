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
  ExamType,
  type ExamTypeDocument,
} from '../../schemas/exam-type.schema.js';
import type { CreateExamTypeDto } from './dto/create-exam-type.dto.js';
import type { ListExamTypesQueryDto } from './dto/list-exam-types-query.dto.js';
import type { UpdateExamTypeDto } from './dto/update-exam-type.dto.js';
import type {
  ExamTypeRecord,
  ExamTypesPage,
  ExamTypesSummary,
} from './exam-types.types.js';

@Injectable()
export class ExamTypesService {
  constructor(
    @InjectModel(ExamType.name)
    private readonly examTypeModel: Model<ExamType>,
  ) {}

  async list(
    auth: AuthIdentity,
    query: ListExamTypesQueryDto,
  ): Promise<ExamTypesPage> {
    const tenantId = this.tenantScope(auth);
    const filter: QueryFilter<ExamType> = { tenantId };

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

    const [examTypes, total, summary] = await Promise.all([
      this.examTypeModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.examTypeModel.countDocuments(filter).exec(),
      this.buildSummary(tenantId),
    ]);

    return {
      items: examTypes.map((examType) => this.toRecord(examType)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async create(
    auth: AuthIdentity,
    dto: CreateExamTypeDto,
  ): Promise<ExamTypeRecord> {
    const tenantId = this.tenantScope(auth);
    const nameKey = dto.name.toLowerCase();

    await this.ensureNameAvailable(tenantId, nameKey);

    const examType = await this.examTypeModel.create({
      tenantId,
      name: dto.name,
      nameKey,
      order: dto.order,
      status: dto.status ?? 'active',
      deletedAt: null,
    });

    return this.toRecord(examType);
  }

  async update(
    auth: AuthIdentity,
    id: string,
    dto: UpdateExamTypeDto,
  ): Promise<ExamTypeRecord> {
    const tenantId = this.tenantScope(auth);
    const examType = await this.findExamType(tenantId, id);
    const updates: Record<string, unknown> = {};

    if (dto.name !== undefined && dto.name !== examType.name) {
      const nameKey = dto.name.toLowerCase();

      await this.ensureNameAvailable(tenantId, nameKey, examType._id);
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
      return this.toRecord(examType);
    }

    const updated = await this.examTypeModel
      .findByIdAndUpdate(
        examType._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Exam type not found.');
    }

    return this.toRecord(updated);
  }

  async remove(auth: AuthIdentity, id: string): Promise<void> {
    const tenantId = this.tenantScope(auth);
    const examType = await this.findExamType(tenantId, id);

    await this.examTypeModel
      .updateOne({ _id: examType._id }, { $set: { deletedAt: new Date() } })
      .exec();
  }

  async restore(auth: AuthIdentity, id: string): Promise<ExamTypeRecord> {
    const tenantId = this.tenantScope(auth);
    const examType = await this.findDeletedExamType(tenantId, id);

    await this.ensureNameAvailable(tenantId, examType.nameKey, examType._id);

    const updated = await this.examTypeModel
      .findByIdAndUpdate(
        examType._id,
        { $set: { deletedAt: null } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Exam type not found.');
    }

    return this.toRecord(updated);
  }

  private tenantScope(auth: AuthIdentity): Types.ObjectId {
    if (!auth.tenantId || !Types.ObjectId.isValid(auth.tenantId)) {
      throw new UnauthorizedException('Tenant context missing.');
    }

    return new Types.ObjectId(auth.tenantId);
  }

  private async findExamType(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<ExamTypeDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Exam type not found.');
    }

    const examType = await this.examTypeModel
      .findOne({ _id: id, tenantId, deletedAt: null })
      .exec();

    if (!examType) {
      throw new NotFoundException('Exam type not found.');
    }

    return examType;
  }

  private async findDeletedExamType(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<ExamTypeDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Exam type not found.');
    }

    const examType = await this.examTypeModel
      .findOne({ _id: id, tenantId, deletedAt: { $ne: null } })
      .exec();

    if (!examType) {
      throw new NotFoundException('Exam type not found.');
    }

    return examType;
  }

  private async ensureNameAvailable(
    tenantId: Types.ObjectId,
    nameKey: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: QueryFilter<ExamType> = {
      tenantId,
      nameKey,
      deletedAt: null,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    if (await this.examTypeModel.exists(filter)) {
      throw new ConflictException(
        'An exam type with this name already exists.',
      );
    }
  }

  private async buildSummary(
    tenantId: Types.ObjectId,
  ): Promise<ExamTypesSummary> {
    const rows = await this.examTypeModel
      .aggregate<{ _id: keyof ExamTypesSummary; count: number }>([
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

    const summary: ExamTypesSummary = {
      active: 0,
      inactive: 0,
      deleted: 0,
    };

    for (const row of rows) {
      summary[row._id] += row.count;
    }

    return summary;
  }

  private toRecord(examType: ExamTypeDocument): ExamTypeRecord {
    const createdAt = examType.get('createdAt') as Date | undefined;
    const updatedAt = examType.get('updatedAt') as Date | undefined;

    return {
      id: examType._id.toString(),
      name: examType.name,
      order: examType.order,
      status: examType.status,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
      deletedAt: examType.deletedAt ? examType.deletedAt.toISOString() : null,
    };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
