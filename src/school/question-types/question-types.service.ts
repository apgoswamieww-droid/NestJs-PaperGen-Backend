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
  QuestionType,
  type QuestionTypeDocument,
} from '../../schemas/question-type.schema.js';
import type { CreateQuestionTypeDto } from './dto/create-question-type.dto.js';
import type { ListQuestionTypesQueryDto } from './dto/list-question-types-query.dto.js';
import type { UpdateQuestionTypeDto } from './dto/update-question-type.dto.js';
import type {
  QuestionTypeRecord,
  QuestionTypesPage,
  QuestionTypesSummary,
} from './question-types.types.js';

@Injectable()
export class QuestionTypesService {
  constructor(
    @InjectModel(QuestionType.name)
    private readonly questionTypeModel: Model<QuestionType>,
  ) {}

  async list(
    auth: AuthIdentity,
    query: ListQuestionTypesQueryDto,
  ): Promise<QuestionTypesPage> {
    const tenantId = this.tenantScope(auth);
    const filter: QueryFilter<QuestionType> = { tenantId };

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

    const [questionTypes, total, summary] = await Promise.all([
      this.questionTypeModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.questionTypeModel.countDocuments(filter).exec(),
      this.buildSummary(tenantId),
    ]);

    return {
      items: questionTypes.map((questionType) => this.toRecord(questionType)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async create(
    auth: AuthIdentity,
    dto: CreateQuestionTypeDto,
  ): Promise<QuestionTypeRecord> {
    const tenantId = this.tenantScope(auth);
    const nameKey = dto.name.toLowerCase();

    await this.ensureNameAvailable(tenantId, nameKey);

    const questionType = await this.questionTypeModel.create({
      tenantId,
      name: dto.name,
      nameKey,
      order: dto.order,
      status: dto.status ?? 'active',
      deletedAt: null,
    });

    return this.toRecord(questionType);
  }

  async update(
    auth: AuthIdentity,
    id: string,
    dto: UpdateQuestionTypeDto,
  ): Promise<QuestionTypeRecord> {
    const tenantId = this.tenantScope(auth);
    const questionType = await this.findQuestionType(tenantId, id);
    const updates: Record<string, unknown> = {};

    if (dto.name !== undefined && dto.name !== questionType.name) {
      const nameKey = dto.name.toLowerCase();

      await this.ensureNameAvailable(tenantId, nameKey, questionType._id);
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
      return this.toRecord(questionType);
    }

    const updated = await this.questionTypeModel
      .findByIdAndUpdate(
        questionType._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Question type not found.');
    }

    return this.toRecord(updated);
  }

  async remove(auth: AuthIdentity, id: string): Promise<void> {
    const tenantId = this.tenantScope(auth);
    const questionType = await this.findQuestionType(tenantId, id);

    await this.questionTypeModel
      .updateOne({ _id: questionType._id }, { $set: { deletedAt: new Date() } })
      .exec();
  }

  async restore(auth: AuthIdentity, id: string): Promise<QuestionTypeRecord> {
    const tenantId = this.tenantScope(auth);
    const questionType = await this.findDeletedQuestionType(tenantId, id);

    await this.ensureNameAvailable(
      tenantId,
      questionType.nameKey,
      questionType._id,
    );

    const updated = await this.questionTypeModel
      .findByIdAndUpdate(
        questionType._id,
        { $set: { deletedAt: null } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Question type not found.');
    }

    return this.toRecord(updated);
  }

  private tenantScope(auth: AuthIdentity): Types.ObjectId {
    if (!auth.tenantId || !Types.ObjectId.isValid(auth.tenantId)) {
      throw new UnauthorizedException('Tenant context missing.');
    }

    return new Types.ObjectId(auth.tenantId);
  }

  private async findQuestionType(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<QuestionTypeDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Question type not found.');
    }

    const questionType = await this.questionTypeModel
      .findOne({ _id: id, tenantId, deletedAt: null })
      .exec();

    if (!questionType) {
      throw new NotFoundException('Question type not found.');
    }

    return questionType;
  }

  private async findDeletedQuestionType(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<QuestionTypeDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Question type not found.');
    }

    const questionType = await this.questionTypeModel
      .findOne({ _id: id, tenantId, deletedAt: { $ne: null } })
      .exec();

    if (!questionType) {
      throw new NotFoundException('Question type not found.');
    }

    return questionType;
  }

  private async ensureNameAvailable(
    tenantId: Types.ObjectId,
    nameKey: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: QueryFilter<QuestionType> = {
      tenantId,
      nameKey,
      deletedAt: null,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    if (await this.questionTypeModel.exists(filter)) {
      throw new ConflictException(
        'A question type with this name already exists.',
      );
    }
  }

  private async buildSummary(
    tenantId: Types.ObjectId,
  ): Promise<QuestionTypesSummary> {
    const rows = await this.questionTypeModel
      .aggregate<{ _id: keyof QuestionTypesSummary; count: number }>([
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

    const summary: QuestionTypesSummary = {
      active: 0,
      inactive: 0,
      deleted: 0,
    };

    for (const row of rows) {
      summary[row._id] += row.count;
    }

    return summary;
  }

  private toRecord(questionType: QuestionTypeDocument): QuestionTypeRecord {
    const createdAt = questionType.get('createdAt') as Date | undefined;
    const updatedAt = questionType.get('updatedAt') as Date | undefined;

    return {
      id: questionType._id.toString(),
      name: questionType.name,
      order: questionType.order,
      status: questionType.status,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
      deletedAt: questionType.deletedAt
        ? questionType.deletedAt.toISOString()
        : null,
    };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
