import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Types,
  type HydratedDocument,
  type Model,
  type QueryFilter,
} from 'mongoose';
import { Chapter } from '../../schemas/chapter.schema.js';
import { Medium } from '../../schemas/medium.schema.js';
import { Standard } from '../../schemas/standard.schema.js';
import { Subject } from '../../schemas/subject.schema.js';
import { Tenant } from '../../schemas/tenant.schema.js';
import { Topic } from '../../schemas/topic.schema.js';
import {
  flattenMasterSeed,
  loadMasterSeed,
  nameKeyOf,
} from './master-seed.data.js';
import type { MasterSeedResult } from './master-seed.types.js';

interface SeedDocument {
  nameKey: string;
  deletedAt: Date | null;
}

interface SeedRow {
  parentId: Types.ObjectId;
  name: string;
  order?: number;
}

interface UpsertedLevel {
  ids: Map<string, Types.ObjectId>;
  created: number;
  reused: number;
}

@Injectable()
export class MasterSeedService {
  private readonly inFlight = new Set<string>();

  constructor(
    @InjectModel(Tenant.name) private readonly tenantModel: Model<Tenant>,
    @InjectModel(Medium.name) private readonly mediumModel: Model<Medium>,
    @InjectModel(Standard.name)
    private readonly standardModel: Model<Standard>,
    @InjectModel(Subject.name) private readonly subjectModel: Model<Subject>,
    @InjectModel(Chapter.name) private readonly chapterModel: Model<Chapter>,
    @InjectModel(Topic.name) private readonly topicModel: Model<Topic>,
  ) {}

  async seed(schoolId: string): Promise<MasterSeedResult> {
    if (!Types.ObjectId.isValid(schoolId)) {
      throw new NotFoundException('School not found.');
    }

    if (this.inFlight.has(schoolId)) {
      throw new ConflictException(
        'Master data seeding is already running for this school.',
      );
    }

    this.inFlight.add(schoolId);

    try {
      const tenant = await this.tenantModel.findById(schoolId).exec();

      if (!tenant) {
        throw new NotFoundException('School not found.');
      }

      return await this.applySeed(tenant._id, schoolId);
    } finally {
      this.inFlight.delete(schoolId);
    }
  }

  private async applySeed(
    tenantId: Types.ObjectId,
    schoolId: string,
  ): Promise<MasterSeedResult> {
    const startedAt = Date.now();
    const plans = flattenMasterSeed(loadMasterSeed());
    const tenantKey = tenantId.toString();

    const mediums = await this.upsertMany(
      this.mediumModel,
      tenantId,
      null,
      plans.mediums.map((name) => ({ parentId: tenantId, name })),
    );

    const mediumId = (name: string): Types.ObjectId =>
      this.requireId(mediums.ids, `${tenantKey}|${nameKeyOf(name)}`, 'medium');

    const standards = await this.upsertMany(
      this.standardModel,
      tenantId,
      'mediumId',
      plans.standards.map((standard) => ({
        parentId: mediumId(standard.medium),
        name: standard.name,
        order: standard.order,
      })),
    );

    const standardId = (medium: string, standard: string): Types.ObjectId =>
      this.requireId(
        standards.ids,
        `${mediumId(medium).toString()}|${nameKeyOf(standard)}`,
        'standard',
      );

    const subjects = await this.upsertMany(
      this.subjectModel,
      tenantId,
      'standardId',
      plans.subjects.map((subject) => ({
        parentId: standardId(subject.medium, subject.standard),
        name: subject.name,
        order: subject.order,
      })),
    );

    const subjectId = (
      medium: string,
      standard: string,
      subject: string,
    ): Types.ObjectId =>
      this.requireId(
        subjects.ids,
        `${standardId(medium, standard).toString()}|${nameKeyOf(subject)}`,
        'subject',
      );

    const chapters = await this.upsertMany(
      this.chapterModel,
      tenantId,
      'subjectId',
      plans.chapters.map((chapter) => ({
        parentId: subjectId(chapter.medium, chapter.standard, chapter.subject),
        name: chapter.name,
        order: chapter.order,
      })),
      { referenceType: 'ncert' },
    );

    const chapterId = (
      medium: string,
      standard: string,
      subject: string,
      chapter: string,
    ): Types.ObjectId =>
      this.requireId(
        chapters.ids,
        `${subjectId(medium, standard, subject).toString()}|${nameKeyOf(chapter)}`,
        'chapter',
      );

    const topics = await this.upsertMany(
      this.topicModel,
      tenantId,
      'chapterId',
      plans.topics.map((topic) => ({
        parentId: chapterId(
          topic.medium,
          topic.standard,
          topic.subject,
          topic.chapter,
        ),
        name: topic.name,
        order: topic.order,
      })),
    );

    return {
      schoolId,
      mediums: { created: mediums.created, reused: mediums.reused },
      standards: { created: standards.created, reused: standards.reused },
      subjects: { created: subjects.created, reused: subjects.reused },
      chapters: { created: chapters.created, reused: chapters.reused },
      topics: { created: topics.created, reused: topics.reused },
      durationMs: Date.now() - startedAt,
    };
  }

  private async upsertMany<TDoc extends SeedDocument>(
    model: Model<TDoc>,
    tenantId: Types.ObjectId,
    parentField: string | null,
    rows: SeedRow[],
    extraFields: Record<string, unknown> = {},
  ): Promise<UpsertedLevel> {
    const ids = new Map<string, Types.ObjectId>();

    if (rows.length === 0) {
      return { ids, created: 0, reused: 0 };
    }

    const parentIds = [
      ...new Map(
        rows.map((row) => [row.parentId.toString(), row.parentId]),
      ).values(),
    ];
    const filter = (
      parentField === null
        ? { tenantId }
        : { tenantId, [parentField]: { $in: parentIds } }
    ) as QueryFilter<TDoc>;
    const existing = await model.find(filter).exec();
    const existingByKey = new Map<string, HydratedDocument<TDoc>>();

    for (const document of existing) {
      const parentId = (document as unknown as Record<string, unknown>)[
        parentField ?? 'tenantId'
      ];

      existingByKey.set(`${String(parentId)}|${document.nameKey}`, document);
    }

    const seen = new Set<string>();
    const missing: SeedRow[] = [];
    const restoredIds: Types.ObjectId[] = [];
    let reused = 0;

    for (const row of rows) {
      const key = `${row.parentId.toString()}|${nameKeyOf(row.name)}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      const document = existingByKey.get(key);

      if (document) {
        ids.set(key, document._id);
        reused += 1;

        if (document.deletedAt) {
          restoredIds.push(document._id);
        }

        continue;
      }

      missing.push({ ...row, order: row.order });
    }

    if (missing.length > 0) {
      const created = await model.insertMany(
        missing.map((row) => ({
          tenantId,
          ...(parentField === null ? {} : { [parentField]: row.parentId }),
          name: row.name,
          nameKey: nameKeyOf(row.name),
          ...(row.order === undefined ? {} : { order: row.order }),
          status: 'active',
          deletedAt: null,
          ...extraFields,
        })),
      );

      created.forEach((document, index) => {
        ids.set(
          `${missing[index].parentId.toString()}|${nameKeyOf(missing[index].name)}`,
          document._id,
        );
      });
    }

    if (restoredIds.length > 0) {
      await model
        .updateMany({ _id: { $in: restoredIds } } as QueryFilter<TDoc>, {
          $set: { deletedAt: null },
        })
        .exec();
    }

    return { ids, created: missing.length, reused };
  }

  private requireId(
    ids: Map<string, Types.ObjectId>,
    key: string,
    label: string,
  ): Types.ObjectId {
    const id = ids.get(key);

    if (!id) {
      throw new Error(`Master seed data references a missing ${label}.`);
    }

    return id;
  }
}
