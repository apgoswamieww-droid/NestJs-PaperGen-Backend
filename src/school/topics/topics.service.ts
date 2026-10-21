import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type QueryFilter } from 'mongoose';
import type { AuthIdentity } from '../../auth/auth.types.js';
import { Chapter } from '../../schemas/chapter.schema.js';
import { Medium } from '../../schemas/medium.schema.js';
import { Standard } from '../../schemas/standard.schema.js';
import { Subject } from '../../schemas/subject.schema.js';
import { Topic, type TopicDocument } from '../../schemas/topic.schema.js';
import type { CreateTopicDto } from './dto/create-topic.dto.js';
import type { ListTopicsQueryDto } from './dto/list-topics-query.dto.js';
import type { UpdateTopicDto } from './dto/update-topic.dto.js';
import type { TopicRecord, TopicsPage, TopicsSummary } from './topics.types.js';

interface ChapterDetail {
  name: string;
  subjectId: Types.ObjectId;
}

interface SubjectDetail {
  name: string;
  standardId: Types.ObjectId;
}

interface StandardDetail {
  name: string;
  mediumId: Types.ObjectId;
}

@Injectable()
export class TopicsService {
  constructor(
    @InjectModel(Topic.name)
    private readonly topicModel: Model<Topic>,
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
    query: ListTopicsQueryDto,
  ): Promise<TopicsPage> {
    const tenantId = this.tenantScope(auth);
    const filter: QueryFilter<Topic> = { tenantId };

    if (!query.includeDeleted) {
      filter.deletedAt = null;
    }

    if (query.chapterId) {
      filter.chapterId = new Types.ObjectId(query.chapterId);
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

    const [topics, total, summary] = await Promise.all([
      this.topicModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.topicModel.countDocuments(filter).exec(),
      this.buildSummary(tenantId),
    ]);

    const chapters = await this.chapterDetails(
      tenantId,
      topics.map((topic) => topic.chapterId),
    );
    const subjects = await this.subjectDetails(
      tenantId,
      [...chapters.values()].map((chapter) => chapter.subjectId),
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
      items: topics.map((topic) => {
        const chapter = chapters.get(topic.chapterId.toString());
        const subject = chapter
          ? subjects.get(chapter.subjectId.toString())
          : undefined;
        const standard = subject
          ? standards.get(subject.standardId.toString())
          : undefined;

        return this.toRecord(topic, chapter, subject, standard, mediumNames);
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async create(auth: AuthIdentity, dto: CreateTopicDto): Promise<TopicRecord> {
    const tenantId = this.tenantScope(auth);
    const chapter = await this.findActiveChapter(tenantId, dto.chapterId);
    const nameKey = dto.name.toLowerCase();

    await this.ensureNameAvailable(tenantId, chapter._id, nameKey);

    const topic = await this.topicModel.create({
      tenantId,
      chapterId: chapter._id,
      name: dto.name,
      nameKey,
      order: dto.order,
      status: dto.status ?? 'active',
      deletedAt: null,
    });

    return this.recordFor(tenantId, topic);
  }

  async update(
    auth: AuthIdentity,
    id: string,
    dto: UpdateTopicDto,
  ): Promise<TopicRecord> {
    const tenantId = this.tenantScope(auth);
    const topic = await this.findTopic(tenantId, id);
    const updates: Record<string, unknown> = {};
    let chapterId = topic.chapterId;

    if (dto.chapterId !== undefined) {
      const chapter = await this.findActiveChapter(tenantId, dto.chapterId);

      chapterId = chapter._id;
      updates['chapterId'] = chapter._id;
    }

    if (
      dto.name !== undefined &&
      (dto.name !== topic.name || !chapterId.equals(topic.chapterId))
    ) {
      const nameKey = dto.name.toLowerCase();

      await this.ensureNameAvailable(tenantId, chapterId, nameKey, topic._id);
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
      return this.recordFor(tenantId, topic);
    }

    const updated = await this.topicModel
      .findByIdAndUpdate(
        topic._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Topic not found.');
    }

    return this.recordFor(tenantId, updated);
  }

  async remove(auth: AuthIdentity, id: string): Promise<void> {
    const tenantId = this.tenantScope(auth);
    const topic = await this.findTopic(tenantId, id);

    await this.topicModel
      .updateOne({ _id: topic._id }, { $set: { deletedAt: new Date() } })
      .exec();
  }

  async restore(auth: AuthIdentity, id: string): Promise<TopicRecord> {
    const tenantId = this.tenantScope(auth);
    const topic = await this.findDeletedTopic(tenantId, id);

    await this.ensureNameAvailable(
      tenantId,
      topic.chapterId,
      topic.nameKey,
      topic._id,
    );

    const updated = await this.topicModel
      .findByIdAndUpdate(
        topic._id,
        { $set: { deletedAt: null } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Topic not found.');
    }

    return this.recordFor(tenantId, updated);
  }

  private tenantScope(auth: AuthIdentity): Types.ObjectId {
    if (!auth.tenantId || !Types.ObjectId.isValid(auth.tenantId)) {
      throw new UnauthorizedException('Tenant context missing.');
    }

    return new Types.ObjectId(auth.tenantId);
  }

  private async findActiveChapter(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<{ _id: Types.ObjectId; name: string; subjectId: Types.ObjectId }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Chapter not found or inactive.');
    }

    const chapter = await this.chapterModel
      .findOne({
        _id: id,
        tenantId,
        deletedAt: null,
        status: 'active',
      })
      .select('name subjectId')
      .exec();

    if (!chapter) {
      throw new NotFoundException('Chapter not found or inactive.');
    }

    return chapter;
  }

  private async findTopic(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<TopicDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Topic not found.');
    }

    const topic = await this.topicModel
      .findOne({ _id: id, tenantId, deletedAt: null })
      .exec();

    if (!topic) {
      throw new NotFoundException('Topic not found.');
    }

    return topic;
  }

  private async findDeletedTopic(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<TopicDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Topic not found.');
    }

    const topic = await this.topicModel
      .findOne({ _id: id, tenantId, deletedAt: { $ne: null } })
      .exec();

    if (!topic) {
      throw new NotFoundException('Topic not found.');
    }

    return topic;
  }

  private async ensureNameAvailable(
    tenantId: Types.ObjectId,
    chapterId: Types.ObjectId,
    nameKey: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: QueryFilter<Topic> = {
      tenantId,
      chapterId,
      nameKey,
      deletedAt: null,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    if (await this.topicModel.exists(filter)) {
      throw new ConflictException(
        'A topic with this name already exists for this chapter.',
      );
    }
  }

  private async chapterDetails(
    tenantId: Types.ObjectId,
    chapterIds: Types.ObjectId[],
  ): Promise<Map<string, ChapterDetail>> {
    if (chapterIds.length === 0) {
      return new Map();
    }

    const chapters = await this.chapterModel
      .find({ _id: { $in: uniqueIds(chapterIds) }, tenantId })
      .select('name subjectId')
      .exec();

    return new Map(
      chapters.map((chapter) => [
        chapter._id.toString(),
        { name: chapter.name, subjectId: chapter.subjectId },
      ]),
    );
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

  private async buildSummary(tenantId: Types.ObjectId): Promise<TopicsSummary> {
    const rows = await this.topicModel
      .aggregate<{ _id: keyof TopicsSummary; count: number }>([
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

    const summary: TopicsSummary = { active: 0, inactive: 0, deleted: 0 };

    for (const row of rows) {
      summary[row._id] += row.count;
    }

    return summary;
  }

  private async recordFor(
    tenantId: Types.ObjectId,
    topic: TopicDocument,
  ): Promise<TopicRecord> {
    const chapters = await this.chapterDetails(tenantId, [topic.chapterId]);
    const chapter = chapters.get(topic.chapterId.toString());
    const subjects = await this.subjectDetails(
      tenantId,
      chapter ? [chapter.subjectId] : [],
    );
    const subject = chapter
      ? subjects.get(chapter.subjectId.toString())
      : undefined;
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

    return this.toRecord(topic, chapter, subject, standard, mediumNames);
  }

  private toRecord(
    topic: TopicDocument,
    chapter: ChapterDetail | undefined,
    subject: SubjectDetail | undefined,
    standard: StandardDetail | undefined,
    mediumNames: Map<string, string>,
  ): TopicRecord {
    const createdAt = topic.get('createdAt') as Date | undefined;
    const updatedAt = topic.get('updatedAt') as Date | undefined;
    const mediumId = standard?.mediumId.toString() ?? '';

    return {
      id: topic._id.toString(),
      name: topic.name,
      chapterId: topic.chapterId.toString(),
      chapterName: chapter?.name ?? 'Unknown',
      subjectId: chapter?.subjectId.toString() ?? '',
      subjectName: subject?.name ?? 'Unknown',
      standardId: subject?.standardId.toString() ?? '',
      standardName: standard?.name ?? 'Unknown',
      mediumId,
      mediumName: mediumNames.get(mediumId) ?? 'Unknown',
      order: topic.order,
      status: topic.status,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
      deletedAt: topic.deletedAt ? topic.deletedAt.toISOString() : null,
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
