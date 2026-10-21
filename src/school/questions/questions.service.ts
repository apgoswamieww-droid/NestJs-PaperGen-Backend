import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type QueryFilter } from 'mongoose';
import type { AuthIdentity } from '../../auth/auth.types.js';
import { BloomLevel } from '../../schemas/bloom-level.schema.js';
import { Chapter } from '../../schemas/chapter.schema.js';
import { DifficultyLevel } from '../../schemas/difficulty-level.schema.js';
import { Medium } from '../../schemas/medium.schema.js';
import { QuestionType } from '../../schemas/question-type.schema.js';
import {
  Question,
  type QuestionDocument,
  type QuestionOption,
  type QuestionStatus,
} from '../../schemas/question.schema.js';
import { Standard } from '../../schemas/standard.schema.js';
import { Subject } from '../../schemas/subject.schema.js';
import { Topic } from '../../schemas/topic.schema.js';
import type { CreateQuestionDto } from './dto/create-question.dto.js';
import type { ListQuestionsQueryDto } from './dto/list-questions-query.dto.js';
import type { UpdateQuestionDto } from './dto/update-question.dto.js';
import {
  hasQuestionAnswer,
  normalizeQuestionOptions,
  normalizeQuestionTags,
  type QuestionOptionValue,
} from './question-options.js';
import type {
  QuestionListItem,
  QuestionRecord,
  QuestionsPage,
  QuestionsSummary,
} from './questions.types.js';

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

interface DisplayMaps {
  chapters: Map<string, ChapterDetail>;
  subjects: Map<string, SubjectDetail>;
  standards: Map<string, StandardDetail>;
  mediums: Map<string, string>;
  topics: Map<string, string>;
  questionTypes: Map<string, string>;
  difficultyLevels: Map<string, string>;
  bloomLevels: Map<string, string>;
}

interface WriteReferenceInput {
  chapterId: string;
  topicId?: string | null;
  questionTypeId: string;
  difficultyLevelId: string;
  bloomLevelId?: string | null;
}

interface ResolvedReferences {
  chapterId: Types.ObjectId;
  topicId: Types.ObjectId | null;
  questionTypeId: Types.ObjectId;
  difficultyLevelId: Types.ObjectId;
  bloomLevelId: Types.ObjectId | null;
}

@Injectable()
export class QuestionsService {
  constructor(
    @InjectModel(Question.name)
    private readonly questionModel: Model<Question>,
    @InjectModel(Chapter.name)
    private readonly chapterModel: Model<Chapter>,
    @InjectModel(Topic.name)
    private readonly topicModel: Model<Topic>,
    @InjectModel(Subject.name)
    private readonly subjectModel: Model<Subject>,
    @InjectModel(Standard.name)
    private readonly standardModel: Model<Standard>,
    @InjectModel(Medium.name)
    private readonly mediumModel: Model<Medium>,
    @InjectModel(QuestionType.name)
    private readonly questionTypeModel: Model<QuestionType>,
    @InjectModel(DifficultyLevel.name)
    private readonly difficultyLevelModel: Model<DifficultyLevel>,
    @InjectModel(BloomLevel.name)
    private readonly bloomLevelModel: Model<BloomLevel>,
  ) {}

  async list(
    auth: AuthIdentity,
    query: ListQuestionsQueryDto,
  ): Promise<QuestionsPage> {
    const tenantId = this.tenantScope(auth);
    const filter: QueryFilter<Question> = { tenantId };

    if (!query.includeDeleted) {
      filter.deletedAt = null;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.questionTypeId) {
      filter.questionTypeId = new Types.ObjectId(query.questionTypeId);
    }

    if (query.difficultyLevelId) {
      filter.difficultyLevelId = new Types.ObjectId(query.difficultyLevelId);
    }

    if (query.bloomLevelId) {
      filter.bloomLevelId = new Types.ObjectId(query.bloomLevelId);
    }

    const chapterIds = await this.resolveChapterFilter(tenantId, query);

    if (chapterIds !== null) {
      filter.chapterId = { $in: chapterIds };
    }

    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search), 'i');

      filter.$or = [
        { text: pattern },
        { answer: pattern },
        { source: pattern },
        { tags: pattern },
      ];
    }

    const sort: Record<string, 1 | -1> = {
      [query.sort]: query.dir === 'asc' ? 1 : -1,
      _id: 1,
    };

    const [questions, total, summary] = await Promise.all([
      this.questionModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.questionModel.countDocuments(filter).exec(),
      this.buildSummary(tenantId),
    ]);
    const maps = await this.loadDisplayMaps(tenantId, questions);

    return {
      items: questions.map((question) => this.toListItem(question, maps)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async get(auth: AuthIdentity, id: string): Promise<QuestionRecord> {
    const tenantId = this.tenantScope(auth);
    const question = await this.findQuestion(tenantId, id);

    return this.recordFor(tenantId, question);
  }

  async create(
    auth: AuthIdentity,
    dto: CreateQuestionDto,
  ): Promise<QuestionRecord> {
    const tenantId = this.tenantScope(auth);
    const refs = await this.resolveWriteReferences(tenantId, dto);
    const { value: options, errors } = normalizeQuestionOptions(
      dto.options ?? [],
    );

    if (errors.length > 0) {
      throw new BadRequestException(errors[0]);
    }

    const answer = dto.answer?.trim() ?? '';
    const status = dto.status ?? 'active';

    this.ensureAnswerKey(status, answer, options);

    const actorId = this.actorId(auth);
    const question = await this.questionModel.create({
      tenantId,
      ...refs,
      text: dto.text,
      options,
      answer,
      explanation: dto.explanation?.trim() ?? '',
      source: dto.source?.trim() ?? '',
      tags: normalizeQuestionTags(dto.tags ?? []),
      marks: dto.marks,
      status,
      createdBy: actorId,
      updatedBy: actorId,
      deletedAt: null,
    });

    return this.recordFor(tenantId, question);
  }

  async update(
    auth: AuthIdentity,
    id: string,
    dto: UpdateQuestionDto,
  ): Promise<QuestionRecord> {
    const tenantId = this.tenantScope(auth);
    const question = await this.findQuestion(tenantId, id);
    const updates: Record<string, unknown> = {};
    let chapterId = question.chapterId;
    let topicId = question.topicId;
    let chapterChanged = false;

    if (
      dto.chapterId !== undefined &&
      dto.chapterId !== question.chapterId.toString()
    ) {
      const chapter = await this.findActiveChapter(tenantId, dto.chapterId);

      chapterId = chapter._id;
      chapterChanged = true;
      updates['chapterId'] = chapter._id;
    }

    if (dto.topicId !== undefined) {
      const currentTopicId = question.topicId?.toString() ?? null;

      if (dto.topicId === null) {
        if (currentTopicId !== null) {
          topicId = null;
          updates['topicId'] = null;
        }
      } else if (chapterChanged || dto.topicId !== currentTopicId) {
        topicId = await this.findActiveTopic(tenantId, dto.topicId, chapterId);
        updates['topicId'] = topicId;
      }
    } else if (chapterChanged) {
      topicId = null;
      updates['topicId'] = null;
    }

    if (
      dto.questionTypeId !== undefined &&
      dto.questionTypeId !== question.questionTypeId.toString()
    ) {
      updates['questionTypeId'] = await this.findActiveQuestionType(
        tenantId,
        dto.questionTypeId,
      );
    }

    if (
      dto.difficultyLevelId !== undefined &&
      dto.difficultyLevelId !== question.difficultyLevelId.toString()
    ) {
      updates['difficultyLevelId'] = await this.findActiveDifficultyLevel(
        tenantId,
        dto.difficultyLevelId,
      );
    }

    if (dto.bloomLevelId !== undefined) {
      const currentBloomId = question.bloomLevelId?.toString() ?? null;

      if (dto.bloomLevelId === null) {
        if (currentBloomId !== null) {
          updates['bloomLevelId'] = null;
        }
      } else if (dto.bloomLevelId !== currentBloomId) {
        updates['bloomLevelId'] = await this.findActiveBloomLevel(
          tenantId,
          dto.bloomLevelId,
        );
      }
    }

    if (dto.text !== undefined) {
      updates['text'] = dto.text;
    }

    let options = optionsOf(question);
    let optionsChanged = false;

    if (dto.options !== undefined) {
      const normalized = normalizeQuestionOptions(dto.options);

      if (normalized.errors.length > 0) {
        throw new BadRequestException(normalized.errors[0]);
      }

      options = normalized.value;
      optionsChanged = true;
    }

    if (optionsChanged) {
      updates['options'] = options;
    }

    if (dto.answer !== undefined) {
      updates['answer'] = dto.answer;
    }

    if (dto.explanation !== undefined) {
      updates['explanation'] = dto.explanation;
    }

    if (dto.source !== undefined) {
      updates['source'] = dto.source;
    }

    if (dto.tags !== undefined) {
      updates['tags'] = normalizeQuestionTags(dto.tags);
    }

    if (dto.marks !== undefined) {
      updates['marks'] = dto.marks;
    }

    const status = dto.status ?? question.status;
    const answer = dto.answer !== undefined ? dto.answer : question.answer;

    if (dto.status !== undefined) {
      updates['status'] = dto.status;
    }

    this.ensureAnswerKey(status, answer, options);

    if (Object.keys(updates).length === 0) {
      return this.recordFor(tenantId, question);
    }

    updates['updatedBy'] = this.actorId(auth);

    const updated = await this.questionModel
      .findByIdAndUpdate(
        question._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Question not found.');
    }

    return this.recordFor(tenantId, updated);
  }

  async remove(auth: AuthIdentity, id: string): Promise<void> {
    const tenantId = this.tenantScope(auth);
    const question = await this.findQuestion(tenantId, id);

    await this.questionModel
      .updateOne(
        { _id: question._id },
        {
          $set: {
            deletedAt: new Date(),
            updatedBy: this.actorId(auth),
          },
        },
      )
      .exec();
  }

  async restore(auth: AuthIdentity, id: string): Promise<QuestionRecord> {
    const tenantId = this.tenantScope(auth);
    const question = await this.findDeletedQuestion(tenantId, id);
    const updated = await this.questionModel
      .findByIdAndUpdate(
        question._id,
        {
          $set: {
            deletedAt: null,
            updatedBy: this.actorId(auth),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Question not found.');
    }

    return this.recordFor(tenantId, updated);
  }

  private tenantScope(auth: AuthIdentity): Types.ObjectId {
    if (!auth.tenantId || !Types.ObjectId.isValid(auth.tenantId)) {
      throw new UnauthorizedException('Tenant context missing.');
    }

    return new Types.ObjectId(auth.tenantId);
  }

  private actorId(auth: AuthIdentity): Types.ObjectId | null {
    return Types.ObjectId.isValid(auth.id) ? new Types.ObjectId(auth.id) : null;
  }

  private async findQuestion(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<QuestionDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Question not found.');
    }

    const question = await this.questionModel
      .findOne({ _id: id, tenantId, deletedAt: null })
      .exec();

    if (!question) {
      throw new NotFoundException('Question not found.');
    }

    return question;
  }

  private async findDeletedQuestion(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<QuestionDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Question not found.');
    }

    const question = await this.questionModel
      .findOne({ _id: id, tenantId, deletedAt: { $ne: null } })
      .exec();

    if (!question) {
      throw new NotFoundException('Question not found.');
    }

    return question;
  }

  private async resolveWriteReferences(
    tenantId: Types.ObjectId,
    input: WriteReferenceInput,
  ): Promise<ResolvedReferences> {
    const chapter = await this.findActiveChapter(tenantId, input.chapterId);
    const topicId = await this.resolveTopicId(
      tenantId,
      input.topicId,
      chapter._id,
    );
    const questionTypeId = await this.findActiveQuestionType(
      tenantId,
      input.questionTypeId,
    );
    const difficultyLevelId = await this.findActiveDifficultyLevel(
      tenantId,
      input.difficultyLevelId,
    );
    const bloomLevelId = input.bloomLevelId
      ? await this.findActiveBloomLevel(tenantId, input.bloomLevelId)
      : null;

    return {
      chapterId: chapter._id,
      topicId,
      questionTypeId,
      difficultyLevelId,
      bloomLevelId,
    };
  }

  private async resolveTopicId(
    tenantId: Types.ObjectId,
    topicId: string | null | undefined,
    chapterId: Types.ObjectId,
  ): Promise<Types.ObjectId | null> {
    if (!topicId) {
      return null;
    }

    return this.findActiveTopic(tenantId, topicId, chapterId);
  }

  private async findActiveChapter(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<{ _id: Types.ObjectId }> {
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
      .select('_id')
      .exec();

    if (!chapter) {
      throw new NotFoundException('Chapter not found or inactive.');
    }

    return chapter;
  }

  private async findActiveTopic(
    tenantId: Types.ObjectId,
    id: string,
    chapterId: Types.ObjectId,
  ): Promise<Types.ObjectId> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(
        'Topic not found in this chapter or inactive.',
      );
    }

    const topic = await this.topicModel
      .findOne({
        _id: id,
        tenantId,
        chapterId,
        deletedAt: null,
        status: 'active',
      })
      .select('_id')
      .exec();

    if (!topic) {
      throw new NotFoundException(
        'Topic not found in this chapter or inactive.',
      );
    }

    return topic._id;
  }

  private async findActiveQuestionType(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<Types.ObjectId> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Question type not found or inactive.');
    }

    const questionType = await this.questionTypeModel
      .findOne({
        _id: id,
        tenantId,
        deletedAt: null,
        status: 'active',
      })
      .select('_id')
      .exec();

    if (!questionType) {
      throw new NotFoundException('Question type not found or inactive.');
    }

    return questionType._id;
  }

  private async findActiveDifficultyLevel(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<Types.ObjectId> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Difficulty level not found or inactive.');
    }

    const difficulty = await this.difficultyLevelModel
      .findOne({
        _id: id,
        tenantId,
        deletedAt: null,
        status: 'active',
      })
      .select('_id')
      .exec();

    if (!difficulty) {
      throw new NotFoundException('Difficulty level not found or inactive.');
    }

    return difficulty._id;
  }

  private async findActiveBloomLevel(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<Types.ObjectId> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Bloom level not found or inactive.');
    }

    const bloomLevel = await this.bloomLevelModel
      .findOne({
        _id: id,
        tenantId,
        deletedAt: null,
        status: 'active',
      })
      .select('_id')
      .exec();

    if (!bloomLevel) {
      throw new NotFoundException('Bloom level not found or inactive.');
    }

    return bloomLevel._id;
  }

  private ensureAnswerKey(
    status: QuestionStatus,
    answer: string,
    options: readonly QuestionOptionValue[],
  ): void {
    if (status === 'active' && !hasQuestionAnswer(answer, options)) {
      throw new BadRequestException(
        'Add an answer or mark a correct option for an active question.',
      );
    }
  }

  private async resolveChapterFilter(
    tenantId: Types.ObjectId,
    query: ListQuestionsQueryDto,
  ): Promise<Types.ObjectId[] | null> {
    let chapterId = query.chapterId
      ? new Types.ObjectId(query.chapterId)
      : null;
    let subjectId = query.subjectId
      ? new Types.ObjectId(query.subjectId)
      : null;
    let standardId = query.standardId
      ? new Types.ObjectId(query.standardId)
      : null;
    let mediumId = query.mediumId ? new Types.ObjectId(query.mediumId) : null;

    if (query.topicId) {
      const topic = await this.topicModel
        .findOne({
          _id: query.topicId,
          tenantId,
          deletedAt: null,
        })
        .select('chapterId')
        .exec();

      if (!topic) {
        return [];
      }

      if (chapterId && !chapterId.equals(topic.chapterId)) {
        return [];
      }

      chapterId = topic.chapterId;
    }

    if (chapterId) {
      const chapter = await this.chapterModel
        .findOne({ _id: chapterId, tenantId, deletedAt: null })
        .select('subjectId')
        .exec();

      if (!chapter) {
        return [];
      }

      if (subjectId && !subjectId.equals(chapter.subjectId)) {
        return [];
      }

      subjectId = chapter.subjectId;
    }

    if (subjectId) {
      const subject = await this.subjectModel
        .findOne({ _id: subjectId, tenantId, deletedAt: null })
        .select('standardId')
        .exec();

      if (!subject) {
        return [];
      }

      if (standardId && !standardId.equals(subject.standardId)) {
        return [];
      }

      standardId = subject.standardId;
    }

    if (standardId) {
      const standard = await this.standardModel
        .findOne({ _id: standardId, tenantId, deletedAt: null })
        .select('mediumId')
        .exec();

      if (!standard) {
        return [];
      }

      if (mediumId && !mediumId.equals(standard.mediumId)) {
        return [];
      }

      mediumId = standard.mediumId;
    }

    if (chapterId) {
      return [chapterId];
    }

    if (subjectId) {
      return this.chapterIdsForSubject(tenantId, subjectId);
    }

    if (standardId) {
      return this.chapterIdsForStandard(tenantId, standardId);
    }

    if (mediumId) {
      return this.chapterIdsForMedium(tenantId, mediumId);
    }

    return null;
  }

  private async chapterIdsForSubject(
    tenantId: Types.ObjectId,
    subjectId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    return this.chapterModel
      .find({ tenantId, subjectId, deletedAt: null })
      .distinct('_id')
      .exec();
  }

  private async chapterIdsForStandard(
    tenantId: Types.ObjectId,
    standardId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const subjectIds = await this.subjectModel
      .find({ tenantId, standardId, deletedAt: null })
      .distinct('_id')
      .exec();

    if (subjectIds.length === 0) {
      return [];
    }

    return this.chapterModel
      .find({ tenantId, subjectId: { $in: subjectIds }, deletedAt: null })
      .distinct('_id')
      .exec();
  }

  private async chapterIdsForMedium(
    tenantId: Types.ObjectId,
    mediumId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const standardIds = await this.standardModel
      .find({ tenantId, mediumId, deletedAt: null })
      .distinct('_id')
      .exec();

    if (standardIds.length === 0) {
      return [];
    }

    const subjectIds = await this.subjectModel
      .find({ tenantId, standardId: { $in: standardIds }, deletedAt: null })
      .distinct('_id')
      .exec();

    if (subjectIds.length === 0) {
      return [];
    }

    return this.chapterModel
      .find({ tenantId, subjectId: { $in: subjectIds }, deletedAt: null })
      .distinct('_id')
      .exec();
  }

  private async buildSummary(
    tenantId: Types.ObjectId,
  ): Promise<QuestionsSummary> {
    const rows = await this.questionModel
      .aggregate<{
        _id: 'active' | 'inactive' | 'deleted';
        count: number;
      }>([
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

    const summary: QuestionsSummary = {
      total: 0,
      active: 0,
      inactive: 0,
      deleted: 0,
    };

    for (const row of rows) {
      summary[row._id] += row.count;

      if (row._id !== 'deleted') {
        summary.total += row.count;
      }
    }

    return summary;
  }

  private async recordFor(
    tenantId: Types.ObjectId,
    question: QuestionDocument,
  ): Promise<QuestionRecord> {
    const maps = await this.loadDisplayMaps(tenantId, [question]);
    const item = this.toListItem(question, maps);
    const createdAt = question.get('createdAt') as Date | undefined;
    const updatedAt = question.get('updatedAt') as Date | undefined;

    return {
      ...item,
      options: optionsOf(question),
      answer: question.answer,
      explanation: question.explanation,
      source: question.source,
      tags: [...question.tags],
      createdBy: question.createdBy?.toString() ?? null,
      updatedBy: question.updatedBy?.toString() ?? null,
      deletedAt: question.deletedAt ? question.deletedAt.toISOString() : null,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
    };
  }

  private async loadDisplayMaps(
    tenantId: Types.ObjectId,
    questions: QuestionDocument[],
  ): Promise<DisplayMaps> {
    const chapterIds = questions.map((question) => question.chapterId);
    const chapters = await this.chapterDetails(tenantId, chapterIds);
    const subjectIds = [...chapters.values()].map(
      (chapter) => chapter.subjectId,
    );
    const subjects = await this.subjectDetails(tenantId, subjectIds);
    const standardIds = [...subjects.values()].map(
      (subject) => subject.standardId,
    );
    const standards = await this.standardDetails(tenantId, standardIds);
    const mediumIds = [...standards.values()].map(
      (standard) => standard.mediumId,
    );
    const topicIds = questions
      .map((question) => question.topicId)
      .filter((id): id is Types.ObjectId => id !== null);

    const [mediums, topics, questionTypes, difficultyLevels, bloomLevels] =
      await Promise.all([
        this.mediumNames(tenantId, uniqueIds(mediumIds)),
        this.topicNames(tenantId, uniqueIds(topicIds)),
        this.questionTypeNames(
          tenantId,
          uniqueIds(questions.map((question) => question.questionTypeId)),
        ),
        this.difficultyLevelNames(
          tenantId,
          uniqueIds(questions.map((question) => question.difficultyLevelId)),
        ),
        this.bloomLevelNames(
          tenantId,
          uniqueIds(
            questions
              .map((question) => question.bloomLevelId)
              .filter((id): id is Types.ObjectId => id !== null),
          ),
        ),
      ]);

    return {
      chapters,
      subjects,
      standards,
      mediums,
      topics,
      questionTypes,
      difficultyLevels,
      bloomLevels,
    };
  }

  private toListItem(
    question: QuestionDocument,
    maps: DisplayMaps,
  ): QuestionListItem {
    const chapter = maps.chapters.get(question.chapterId.toString());
    const subject = chapter
      ? maps.subjects.get(chapter.subjectId.toString())
      : undefined;
    const standard = subject
      ? maps.standards.get(subject.standardId.toString())
      : undefined;
    const mediumId = standard?.mediumId.toString() ?? '';
    const options = optionsOf(question);
    const createdAt = question.get('createdAt') as Date | undefined;
    const updatedAt = question.get('updatedAt') as Date | undefined;
    const topicId = question.topicId?.toString() ?? null;
    const bloomLevelId = question.bloomLevelId?.toString() ?? null;

    return {
      id: question._id.toString(),
      text: question.text,
      marks: question.marks,
      status: question.status,
      chapterId: question.chapterId.toString(),
      chapterName: chapter?.name ?? 'Unknown',
      subjectId: chapter?.subjectId.toString() ?? '',
      subjectName: subject?.name ?? 'Unknown',
      standardId: subject?.standardId.toString() ?? '',
      standardName: standard?.name ?? 'Unknown',
      mediumId,
      mediumName: maps.mediums.get(mediumId) ?? 'Unknown',
      topicId,
      topicName: topicId ? (maps.topics.get(topicId) ?? 'Unknown') : null,
      questionTypeId: question.questionTypeId.toString(),
      questionTypeName:
        maps.questionTypes.get(question.questionTypeId.toString()) ?? 'Unknown',
      difficultyLevelId: question.difficultyLevelId.toString(),
      difficultyLevelName:
        maps.difficultyLevels.get(question.difficultyLevelId.toString()) ??
        'Unknown',
      bloomLevelId,
      bloomLevelName: bloomLevelId
        ? (maps.bloomLevels.get(bloomLevelId) ?? 'Unknown')
        : null,
      optionCount: options.length,
      hasAnswer: hasQuestionAnswer(question.answer, options),
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
      deletedAt: question.deletedAt ? question.deletedAt.toISOString() : null,
    };
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
    ids: Types.ObjectId[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const documents = await this.mediumModel
      .find({ _id: { $in: ids }, tenantId })
      .select('name')
      .exec();

    return new Map(
      documents.map((document) => [document._id.toString(), document.name]),
    );
  }

  private async topicNames(
    tenantId: Types.ObjectId,
    ids: Types.ObjectId[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const documents = await this.topicModel
      .find({ _id: { $in: ids }, tenantId })
      .select('name')
      .exec();

    return new Map(
      documents.map((document) => [document._id.toString(), document.name]),
    );
  }

  private async questionTypeNames(
    tenantId: Types.ObjectId,
    ids: Types.ObjectId[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const documents = await this.questionTypeModel
      .find({ _id: { $in: ids }, tenantId })
      .select('name')
      .exec();

    return new Map(
      documents.map((document) => [document._id.toString(), document.name]),
    );
  }

  private async difficultyLevelNames(
    tenantId: Types.ObjectId,
    ids: Types.ObjectId[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const documents = await this.difficultyLevelModel
      .find({ _id: { $in: ids }, tenantId })
      .select('name')
      .exec();

    return new Map(
      documents.map((document) => [document._id.toString(), document.name]),
    );
  }

  private async bloomLevelNames(
    tenantId: Types.ObjectId,
    ids: Types.ObjectId[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const documents = await this.bloomLevelModel
      .find({ _id: { $in: ids }, tenantId })
      .select('name')
      .exec();

    return new Map(
      documents.map((document) => [document._id.toString(), document.name]),
    );
  }
}

function optionsOf(question: QuestionDocument): QuestionOptionValue[] {
  return (question.options as QuestionOption[]).map((option) => ({
    key: option.key,
    text: option.text,
    isCorrect: option.isCorrect,
  }));
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
