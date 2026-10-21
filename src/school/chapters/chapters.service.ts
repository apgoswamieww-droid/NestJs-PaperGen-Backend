import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type QueryFilter } from 'mongoose';
import type { AuthIdentity } from '../../auth/auth.types.js';
import { Chapter, type ChapterDocument } from '../../schemas/chapter.schema.js';
import { Medium } from '../../schemas/medium.schema.js';
import { Standard } from '../../schemas/standard.schema.js';
import { Subject } from '../../schemas/subject.schema.js';
import type { CreateChapterDto } from './dto/create-chapter.dto.js';
import type { ListChaptersQueryDto } from './dto/list-chapters-query.dto.js';
import type { UpdateChapterDto } from './dto/update-chapter.dto.js';
import type {
  ChapterRecord,
  ChaptersPage,
  ChaptersSummary,
} from './chapters.types.js';

interface SubjectDetail {
  name: string;
  standardId: Types.ObjectId;
}

interface StandardDetail {
  name: string;
  mediumId: Types.ObjectId;
}

@Injectable()
export class ChaptersService {
  constructor(
    @InjectModel(Chapter.name)
    private readonly chapterModel: Model<Chapter>,
    @InjectModel(Subject.name)
    private readonly subjectModel: Model<Subject>,
    @InjectModel(Standard.name)
    private readonly standardModel: Model<Standard>,
    @InjectModel(Medium.name)
    private readonly mediumModel: Model<Medium>,
  ) {}

  async list(
    auth: AuthIdentity,
    query: ListChaptersQueryDto,
  ): Promise<ChaptersPage> {
    const tenantId = this.tenantScope(auth);
    const filter: QueryFilter<Chapter> = { tenantId };

    if (!query.includeDeleted) {
      filter.deletedAt = null;
    }

    if (query.subjectId) {
      filter.subjectId = new Types.ObjectId(query.subjectId);
    }

    if (query.referenceType) {
      filter.referenceType = query.referenceType;
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

    const [chapters, total, summary] = await Promise.all([
      this.chapterModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.chapterModel.countDocuments(filter).exec(),
      this.buildSummary(tenantId),
    ]);

    const subjects = await this.subjectDetails(
      tenantId,
      chapters.map((chapter) => chapter.subjectId),
    );
    const standards = await this.standardDetails(
      tenantId,
      [...subjects.values()].map((subject) => subject.standardId),
    );
    const mediumNames = await this.mediumNames(
      tenantId,
      uniqueIds([...standards.values()].map((standard) => standard.mediumId)),
    );

    return {
      items: chapters.map((chapter) => {
        const subject = subjects.get(chapter.subjectId.toString());
        const standard = subject
          ? standards.get(subject.standardId.toString())
          : undefined;

        return this.toRecord(chapter, subject, standard, mediumNames);
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async create(
    auth: AuthIdentity,
    dto: CreateChapterDto,
  ): Promise<ChapterRecord> {
    const tenantId = this.tenantScope(auth);
    const subject = await this.findActiveSubject(tenantId, dto.subjectId);
    const nameKey = dto.name.toLowerCase();

    await this.ensureNameAvailable(tenantId, subject._id, nameKey);

    const chapter = await this.chapterModel.create({
      tenantId,
      subjectId: subject._id,
      name: dto.name,
      nameKey,
      referenceType: dto.referenceType,
      order: dto.order,
      status: dto.status ?? 'active',
      deletedAt: null,
    });

    return this.recordFor(tenantId, chapter);
  }

  async update(
    auth: AuthIdentity,
    id: string,
    dto: UpdateChapterDto,
  ): Promise<ChapterRecord> {
    const tenantId = this.tenantScope(auth);
    const chapter = await this.findChapter(tenantId, id);
    const updates: Record<string, unknown> = {};
    let subjectId = chapter.subjectId;

    if (dto.subjectId !== undefined) {
      const subject = await this.findActiveSubject(tenantId, dto.subjectId);

      subjectId = subject._id;
      updates['subjectId'] = subject._id;
    }

    if (
      dto.name !== undefined &&
      (dto.name !== chapter.name || !subjectId.equals(chapter.subjectId))
    ) {
      const nameKey = dto.name.toLowerCase();

      await this.ensureNameAvailable(tenantId, subjectId, nameKey, chapter._id);
      updates['name'] = dto.name;
      updates['nameKey'] = nameKey;
    }

    if (dto.referenceType !== undefined) {
      updates['referenceType'] = dto.referenceType;
    }

    if (dto.order !== undefined) {
      updates['order'] = dto.order;
    }

    if (dto.status !== undefined) {
      updates['status'] = dto.status;
    }

    if (Object.keys(updates).length === 0) {
      return this.recordFor(tenantId, chapter);
    }

    const updated = await this.chapterModel
      .findByIdAndUpdate(
        chapter._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Chapter not found.');
    }

    return this.recordFor(tenantId, updated);
  }

  async remove(auth: AuthIdentity, id: string): Promise<void> {
    const tenantId = this.tenantScope(auth);
    const chapter = await this.findChapter(tenantId, id);

    await this.chapterModel
      .updateOne({ _id: chapter._id }, { $set: { deletedAt: new Date() } })
      .exec();
  }

  async restore(auth: AuthIdentity, id: string): Promise<ChapterRecord> {
    const tenantId = this.tenantScope(auth);
    const chapter = await this.findDeletedChapter(tenantId, id);

    await this.ensureNameAvailable(
      tenantId,
      chapter.subjectId,
      chapter.nameKey,
      chapter._id,
    );

    const updated = await this.chapterModel
      .findByIdAndUpdate(
        chapter._id,
        { $set: { deletedAt: null } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Chapter not found.');
    }

    return this.recordFor(tenantId, updated);
  }

  private tenantScope(auth: AuthIdentity): Types.ObjectId {
    if (!auth.tenantId || !Types.ObjectId.isValid(auth.tenantId)) {
      throw new UnauthorizedException('Tenant context missing.');
    }

    return new Types.ObjectId(auth.tenantId);
  }

  private async findActiveSubject(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<{
    _id: Types.ObjectId;
    name: string;
    standardId: Types.ObjectId;
  }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Subject not found or inactive.');
    }

    const subject = await this.subjectModel
      .findOne({
        _id: id,
        tenantId,
        deletedAt: null,
        status: 'active',
      })
      .select('name standardId')
      .exec();

    if (!subject) {
      throw new NotFoundException('Subject not found or inactive.');
    }

    return subject;
  }

  private async findChapter(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<ChapterDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Chapter not found.');
    }

    const chapter = await this.chapterModel
      .findOne({ _id: id, tenantId, deletedAt: null })
      .exec();

    if (!chapter) {
      throw new NotFoundException('Chapter not found.');
    }

    return chapter;
  }

  private async findDeletedChapter(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<ChapterDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Chapter not found.');
    }

    const chapter = await this.chapterModel
      .findOne({ _id: id, tenantId, deletedAt: { $ne: null } })
      .exec();

    if (!chapter) {
      throw new NotFoundException('Chapter not found.');
    }

    return chapter;
  }

  private async ensureNameAvailable(
    tenantId: Types.ObjectId,
    subjectId: Types.ObjectId,
    nameKey: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: QueryFilter<Chapter> = {
      tenantId,
      subjectId,
      nameKey,
      deletedAt: null,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    if (await this.chapterModel.exists(filter)) {
      throw new ConflictException(
        'A chapter with this name already exists for this subject.',
      );
    }
  }

  private async subjectDetails(
    tenantId: Types.ObjectId,
    subjectIds: Types.ObjectId[],
  ): Promise<Map<string, SubjectDetail>> {
    if (subjectIds.length === 0) {
      return new Map();
    }

    const subjects = await this.subjectModel
      .find({ _id: { $in: uniqueIds(subjectIds) }, tenantId })
      .select('name standardId')
      .exec();

    return new Map(
      subjects.map((subject) => [
        subject._id.toString(),
        { name: subject.name, standardId: subject.standardId },
      ]),
    );
  }

  private async standardDetails(
    tenantId: Types.ObjectId,
    standardIds: Types.ObjectId[],
  ): Promise<Map<string, StandardDetail>> {
    if (standardIds.length === 0) {
      return new Map();
    }

    const standards = await this.standardModel
      .find({ _id: { $in: uniqueIds(standardIds) }, tenantId })
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
  ): Promise<ChaptersSummary> {
    const rows = await this.chapterModel
      .aggregate<{ _id: keyof ChaptersSummary; count: number }>([
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

    const summary: ChaptersSummary = { active: 0, inactive: 0, deleted: 0 };

    for (const row of rows) {
      summary[row._id] += row.count;
    }

    return summary;
  }

  private async recordFor(
    tenantId: Types.ObjectId,
    chapter: ChapterDocument,
  ): Promise<ChapterRecord> {
    const subjects = await this.subjectDetails(tenantId, [chapter.subjectId]);
    const subject = subjects.get(chapter.subjectId.toString());
    const standards = await this.standardDetails(
      tenantId,
      subject ? [subject.standardId] : [],
    );
    const standard = subject
      ? standards.get(subject.standardId.toString())
      : undefined;
    const mediumNames = await this.mediumNames(
      tenantId,
      standard ? [standard.mediumId] : [],
    );

    return this.toRecord(chapter, subject, standard, mediumNames);
  }

  private toRecord(
    chapter: ChapterDocument,
    subject: SubjectDetail | undefined,
    standard: StandardDetail | undefined,
    mediumNames: Map<string, string>,
  ): ChapterRecord {
    const createdAt = chapter.get('createdAt') as Date | undefined;
    const updatedAt = chapter.get('updatedAt') as Date | undefined;
    const mediumId = standard?.mediumId.toString() ?? '';

    return {
      id: chapter._id.toString(),
      name: chapter.name,
      subjectId: chapter.subjectId.toString(),
      subjectName: subject?.name ?? 'Unknown',
      standardId: subject?.standardId.toString() ?? '',
      standardName: standard?.name ?? 'Unknown',
      mediumId,
      mediumName: mediumNames.get(mediumId) ?? 'Unknown',
      referenceType: chapter.referenceType,
      order: chapter.order,
      status: chapter.status,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
      deletedAt: chapter.deletedAt ? chapter.deletedAt.toISOString() : null,
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
