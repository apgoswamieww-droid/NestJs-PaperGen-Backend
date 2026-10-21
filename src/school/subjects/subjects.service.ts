import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type QueryFilter } from 'mongoose';
import type { AuthIdentity } from '../../auth/auth.types.js';
import { Medium } from '../../schemas/medium.schema.js';
import { Standard } from '../../schemas/standard.schema.js';
import { Subject, type SubjectDocument } from '../../schemas/subject.schema.js';
import type { CreateSubjectDto } from './dto/create-subject.dto.js';
import type { ListSubjectsQueryDto } from './dto/list-subjects-query.dto.js';
import type { UpdateSubjectDto } from './dto/update-subject.dto.js';
import type {
  SubjectRecord,
  SubjectsPage,
  SubjectsSummary,
} from './subjects.types.js';

interface StandardDetail {
  name: string;
  mediumId: Types.ObjectId;
}

@Injectable()
export class SubjectsService {
  constructor(
    @InjectModel(Subject.name)
    private readonly subjectModel: Model<Subject>,
    @InjectModel(Standard.name)
    private readonly standardModel: Model<Standard>,
    @InjectModel(Medium.name)
    private readonly mediumModel: Model<Medium>,
  ) {}

  async list(
    auth: AuthIdentity,
    query: ListSubjectsQueryDto,
  ): Promise<SubjectsPage> {
    const tenantId = this.tenantScope(auth);
    const filter: QueryFilter<Subject> = { tenantId };

    if (!query.includeDeleted) {
      filter.deletedAt = null;
    }

    if (query.standardId) {
      filter.standardId = new Types.ObjectId(query.standardId);
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

    const [subjects, total, summary] = await Promise.all([
      this.subjectModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.subjectModel.countDocuments(filter).exec(),
      this.buildSummary(tenantId),
    ]);

    const details = await this.standardDetails(
      tenantId,
      subjects.map((subject) => subject.standardId),
    );
    const mediumIds = uniqueIds(
      [...details.values()].map((detail) => detail.mediumId),
    );
    const mediumNames = await this.mediumNames(tenantId, mediumIds);

    return {
      items: subjects.map((subject) =>
        this.toRecord(
          subject,
          details.get(subject.standardId.toString()),
          mediumNames,
        ),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async create(
    auth: AuthIdentity,
    dto: CreateSubjectDto,
  ): Promise<SubjectRecord> {
    const tenantId = this.tenantScope(auth);
    const standard = await this.findActiveStandard(tenantId, dto.standardId);
    const nameKey = dto.name.toLowerCase();

    await this.ensureNameAvailable(tenantId, standard._id, nameKey);

    const subject = await this.subjectModel.create({
      tenantId,
      standardId: standard._id,
      name: dto.name,
      nameKey,
      order: dto.order,
      status: dto.status ?? 'active',
      deletedAt: null,
    });

    return this.recordFor(tenantId, subject);
  }

  async update(
    auth: AuthIdentity,
    id: string,
    dto: UpdateSubjectDto,
  ): Promise<SubjectRecord> {
    const tenantId = this.tenantScope(auth);
    const subject = await this.findSubject(tenantId, id);
    const updates: Record<string, unknown> = {};
    let standardId = subject.standardId;

    if (dto.standardId !== undefined) {
      const standard = await this.findActiveStandard(tenantId, dto.standardId);

      standardId = standard._id;
      updates['standardId'] = standard._id;
    }

    if (
      dto.name !== undefined &&
      (dto.name !== subject.name || !standardId.equals(subject.standardId))
    ) {
      const nameKey = dto.name.toLowerCase();

      await this.ensureNameAvailable(
        tenantId,
        standardId,
        nameKey,
        subject._id,
      );
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
      return this.recordFor(tenantId, subject);
    }

    const updated = await this.subjectModel
      .findByIdAndUpdate(
        subject._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Subject not found.');
    }

    return this.recordFor(tenantId, updated);
  }

  async remove(auth: AuthIdentity, id: string): Promise<void> {
    const tenantId = this.tenantScope(auth);
    const subject = await this.findSubject(tenantId, id);

    await this.subjectModel
      .updateOne({ _id: subject._id }, { $set: { deletedAt: new Date() } })
      .exec();
  }

  async restore(auth: AuthIdentity, id: string): Promise<SubjectRecord> {
    const tenantId = this.tenantScope(auth);
    const subject = await this.findDeletedSubject(tenantId, id);

    await this.ensureNameAvailable(
      tenantId,
      subject.standardId,
      subject.nameKey,
      subject._id,
    );

    const updated = await this.subjectModel
      .findByIdAndUpdate(
        subject._id,
        { $set: { deletedAt: null } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Subject not found.');
    }

    return this.recordFor(tenantId, updated);
  }

  private tenantScope(auth: AuthIdentity): Types.ObjectId {
    if (!auth.tenantId || !Types.ObjectId.isValid(auth.tenantId)) {
      throw new UnauthorizedException('Tenant context missing.');
    }

    return new Types.ObjectId(auth.tenantId);
  }

  private async findActiveStandard(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<{ _id: Types.ObjectId; name: string; mediumId: Types.ObjectId }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Standard not found or inactive.');
    }

    const standard = await this.standardModel
      .findOne({
        _id: id,
        tenantId,
        deletedAt: null,
        status: 'active',
      })
      .select('name mediumId')
      .exec();

    if (!standard) {
      throw new NotFoundException('Standard not found or inactive.');
    }

    return standard;
  }

  private async findSubject(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<SubjectDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Subject not found.');
    }

    const subject = await this.subjectModel
      .findOne({ _id: id, tenantId, deletedAt: null })
      .exec();

    if (!subject) {
      throw new NotFoundException('Subject not found.');
    }

    return subject;
  }

  private async findDeletedSubject(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<SubjectDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Subject not found.');
    }

    const subject = await this.subjectModel
      .findOne({ _id: id, tenantId, deletedAt: { $ne: null } })
      .exec();

    if (!subject) {
      throw new NotFoundException('Subject not found.');
    }

    return subject;
  }

  private async ensureNameAvailable(
    tenantId: Types.ObjectId,
    standardId: Types.ObjectId,
    nameKey: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: QueryFilter<Subject> = {
      tenantId,
      standardId,
      nameKey,
      deletedAt: null,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    if (await this.subjectModel.exists(filter)) {
      throw new ConflictException(
        'A subject with this name already exists for this standard.',
      );
    }
  }

  private async standardDetails(
    tenantId: Types.ObjectId,
    standardIds: Types.ObjectId[],
  ): Promise<Map<string, StandardDetail>> {
    if (standardIds.length === 0) {
      return new Map();
    }

    const standards = await this.standardModel
      .find({
        _id: { $in: uniqueIds(standardIds) },
        tenantId,
      })
      .select('name mediumId')
      .exec();

    return new Map(
      standards.map((standard) => [
        standard._id.toString(),
        { name: standard.name, mediumId: standard.mediumId },
      ]),
    );
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
  ): Promise<SubjectsSummary> {
    const rows = await this.subjectModel
      .aggregate<{ _id: keyof SubjectsSummary; count: number }>([
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

    const summary: SubjectsSummary = { active: 0, inactive: 0, deleted: 0 };

    for (const row of rows) {
      summary[row._id] += row.count;
    }

    return summary;
  }

  private async recordFor(
    tenantId: Types.ObjectId,
    subject: SubjectDocument,
  ): Promise<SubjectRecord> {
    const details = await this.standardDetails(tenantId, [subject.standardId]);
    const mediumNames = await this.mediumNames(
      tenantId,
      uniqueIds([...details.values()].map((detail) => detail.mediumId)),
    );

    return this.toRecord(
      subject,
      details.get(subject.standardId.toString()),
      mediumNames,
    );
  }

  private toRecord(
    subject: SubjectDocument,
    standard: StandardDetail | undefined,
    mediumNames: Map<string, string>,
  ): SubjectRecord {
    const createdAt = subject.get('createdAt') as Date | undefined;
    const updatedAt = subject.get('updatedAt') as Date | undefined;
    const mediumId = standard?.mediumId.toString() ?? '';

    return {
      id: subject._id.toString(),
      name: subject.name,
      standardId: subject.standardId.toString(),
      standardName: standard?.name ?? 'Unknown',
      mediumId,
      mediumName: mediumNames.get(mediumId) ?? 'Unknown',
      order: subject.order,
      status: subject.status,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
      deletedAt: subject.deletedAt ? subject.deletedAt.toISOString() : null,
    };
  }
}

function uniqueIds(ids: Types.ObjectId[]): Types.ObjectId[] {
  const seen = new Set<string>();

  return ids.filter((id) => {
    const key = id.toString();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
