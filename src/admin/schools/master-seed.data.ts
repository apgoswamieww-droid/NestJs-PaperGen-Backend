import { readFileSync } from 'node:fs';

export interface MasterSeedMedium {
  name: string;
  standards: MasterSeedStandard[];
}

export interface MasterSeedStandard {
  name: string;
  order: number;
  subjects: MasterSeedSubject[];
}

export interface MasterSeedSubject {
  name: string;
  order: number;
  chapters: MasterSeedChapter[];
}

export interface MasterSeedChapter {
  name: string;
  order: number;
  topics: MasterSeedTopic[];
}

export interface MasterSeedTopic {
  name: string;
  order: number;
}

export interface MasterSeedPlans {
  mediums: string[];
  standards: Array<{ medium: string; name: string; order: number }>;
  subjects: Array<{
    medium: string;
    standard: string;
    name: string;
    order: number;
  }>;
  chapters: Array<{
    medium: string;
    standard: string;
    subject: string;
    name: string;
    order: number;
  }>;
  topics: Array<{
    medium: string;
    standard: string;
    subject: string;
    chapter: string;
    name: string;
    order: number;
  }>;
}

export function nameKeyOf(name: string): string {
  return name.trim().toLowerCase();
}

export function flattenMasterSeed(seed: MasterSeedMedium[]): MasterSeedPlans {
  const plans: MasterSeedPlans = {
    mediums: [],
    standards: [],
    subjects: [],
    chapters: [],
    topics: [],
  };

  for (const medium of seed) {
    if (!plans.mediums.includes(medium.name)) {
      plans.mediums.push(medium.name);
    }

    for (const standard of medium.standards) {
      plans.standards.push({
        medium: medium.name,
        name: standard.name,
        order: standard.order,
      });

      for (const subject of standard.subjects) {
        plans.subjects.push({
          medium: medium.name,
          standard: standard.name,
          name: subject.name,
          order: subject.order,
        });

        for (const chapter of subject.chapters) {
          plans.chapters.push({
            medium: medium.name,
            standard: standard.name,
            subject: subject.name,
            name: chapter.name,
            order: chapter.order,
          });

          for (const topic of chapter.topics) {
            plans.topics.push({
              medium: medium.name,
              standard: standard.name,
              subject: subject.name,
              chapter: chapter.name,
              name: topic.name,
              order: topic.order,
            });
          }
        }
      }
    }
  }

  return plans;
}

export function normalizeMasterSeed(parsed: unknown): MasterSeedMedium[] {
  const standards = asArray(parsed, 'root');

  if (standards.length === 0) {
    throw new Error('Master seed data is invalid: the root array is empty.');
  }

  const mediums = new Map<string, MasterSeedMedium>();

  standards.forEach((rawStandard, standardIndex) => {
    const standard = asRecord(rawStandard, `root[${standardIndex}]`);
    const name = asName(
      standard['standard'],
      `root[${standardIndex}].standard`,
    );
    const subjects = asArray(
      standard['subjects'],
      `root[${standardIndex}].subjects`,
    );

    subjects.forEach((rawSubject, subjectIndex) => {
      const label = `${name}.subjects[${subjectIndex}]`;
      const subject = asRecord(rawSubject, label);
      const subjectName = asName(subject['name'], `${label}.name`);
      const mediumName = asName(subject['medium'], `${label}.medium`);

      let medium = mediums.get(mediumName);

      if (!medium) {
        medium = { name: mediumName, standards: [] };
        mediums.set(mediumName, medium);
      }

      let standardEntry = medium.standards.find((entry) => entry.name === name);

      if (!standardEntry) {
        standardEntry = {
          name,
          order: standardOrderOf(name, standardIndex),
          subjects: [],
        };
        medium.standards.push(standardEntry);
      }

      standardEntry.subjects.push({
        name: subjectName,
        order: standardEntry.subjects.length + 1,
        chapters: normalizeChapters(subject['chapters'], label),
      });
    });
  });

  for (const medium of mediums.values()) {
    medium.standards.sort(
      (left, right) =>
        left.order - right.order || left.name.localeCompare(right.name),
    );
  }

  return [...mediums.values()];
}

export function loadMasterSeed(): MasterSeedMedium[] {
  if (cached) {
    return cached;
  }

  const seedFileUrl = new URL(
    '../../../assets/ncert-science-seeder.json',
    import.meta.url,
  );

  cached = readSeedFile(seedFileUrl);

  return cached;
}

let cached: MasterSeedMedium[] | null = null;

function readSeedFile(seedFileUrl: URL): MasterSeedMedium[] {
  let raw: string;

  try {
    raw = readFileSync(seedFileUrl, 'utf8');
  } catch {
    throw new Error(
      `Master seed data file could not be read at ${seedFileUrl.pathname}.`,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Master seed data file is not valid JSON.');
  }

  return normalizeMasterSeed(parsed);
}

function normalizeChapters(
  raw: unknown,
  subjectLabel: string,
): MasterSeedChapter[] {
  return asArray(raw, `${subjectLabel}.chapters`).map(
    (rawChapter, chapterIndex) => {
      const label = `${subjectLabel}.chapters[${chapterIndex}]`;
      const chapter = asRecord(rawChapter, label);

      return {
        name: asName(chapter['name'], `${label}.name`),
        order: chapterIndex + 1,
        topics: asArray(chapter['topics'], `${label}.topics`).map(
          (rawTopic, topicIndex) => {
            const topicLabel = `${label}.topics[${topicIndex}]`;

            return {
              name: asName(
                asRecord(rawTopic, topicLabel)['name'],
                `${topicLabel}.name`,
              ),
              order: topicIndex + 1,
            };
          },
        ),
      };
    },
  );
}

function standardOrderOf(name: string, index: number): number {
  const match = /(\d+)/.exec(name);
  const order = match ? Number(match[1]) : index + 1;

  if (!Number.isFinite(order)) {
    return index + 1;
  }

  return Math.min(Math.max(Math.trunc(order), 1), 100);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Master seed data is invalid: ${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Master seed data is invalid: ${label} must be an array.`);
  }

  return value;
}

function asName(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Master seed data is invalid: ${label} must be a non-empty string.`,
    );
  }

  return value.trim();
}
