import {
  flattenMasterSeed,
  loadMasterSeed,
  nameKeyOf,
  normalizeMasterSeed,
} from './master-seed.data.js';

describe('nameKeyOf', () => {
  it('trims and lowercases the name', () => {
    expect(nameKeyOf('  Std-11 ')).toBe('std-11');
    expect(nameKeyOf('English')).toBe('english');
  });
});

describe('loadMasterSeed', () => {
  it('loads the science seeder with both mediums and standards', () => {
    const seed = loadMasterSeed();

    expect(seed.map((medium) => medium.name)).toEqual(['English', 'Gujarati']);
    expect(seed.map((medium) => medium.standards.map((s) => s.name))).toEqual([
      ['Std-11', 'Std-12'],
      ['Std-11', 'Std-12'],
    ]);
    expect(seed[0].standards.map((standard) => standard.order)).toEqual([
      11, 12,
    ]);
  });

  it('exposes the full NCERT science dataset', () => {
    const plans = flattenMasterSeed(loadMasterSeed());

    expect(plans.mediums).toHaveLength(2);
    expect(plans.standards).toHaveLength(4);
    expect(plans.subjects).toHaveLength(28);
    expect(plans.chapters).toHaveLength(350);
    expect(plans.topics).toHaveLength(1693);
  });

  it('assigns sequential subject, chapter and topic orders', () => {
    const seed = loadMasterSeed();

    for (const medium of seed) {
      for (const standard of medium.standards) {
        expect(standard.subjects.map((subject) => subject.order)).toEqual(
          standard.subjects.map((_subject, index) => index + 1),
        );

        for (const subject of standard.subjects) {
          expect(subject.chapters.map((chapter) => chapter.order)).toEqual(
            subject.chapters.map((_chapter, index) => index + 1),
          );

          for (const chapter of subject.chapters) {
            expect(chapter.topics.map((topic) => topic.order)).toEqual(
              chapter.topics.map((_topic, index) => index + 1),
            );
          }
        }
      }
    }
  });

  it('has no duplicate names within a parent and no empty names', () => {
    const plans = flattenMasterSeed(loadMasterSeed());

    expect(new Set(plans.mediums).size).toBe(plans.mediums.length);

    const standardKeys = plans.standards.map(
      (standard) => `${standard.medium}|${nameKeyOf(standard.name)}`,
    );
    const subjectKeys = plans.subjects.map(
      (subject) =>
        `${subject.medium}|${subject.standard}|${nameKeyOf(subject.name)}`,
    );
    const chapterKeys = plans.chapters.map(
      (chapter) =>
        `${chapter.medium}|${chapter.standard}|${chapter.subject}|${nameKeyOf(chapter.name)}`,
    );
    const topicKeys = plans.topics.map(
      (topic) =>
        `${topic.medium}|${topic.standard}|${topic.subject}|${topic.chapter}|${nameKeyOf(topic.name)}`,
    );

    expect(new Set(standardKeys).size).toBe(standardKeys.length);
    expect(new Set(subjectKeys).size).toBe(subjectKeys.length);
    expect(new Set(chapterKeys).size).toBe(chapterKeys.length);
    expect(new Set(topicKeys).size).toBe(topicKeys.length);
    expect(
      [
        ...plans.mediums,
        ...plans.standards.map((entry) => entry.name),
        ...plans.subjects.map((entry) => entry.name),
        ...plans.chapters.map((entry) => entry.name),
        ...plans.topics.map((entry) => entry.name),
      ].every((name) => name.trim() !== ''),
    ).toBe(true);
  });

  it('keeps every plan row attached to an existing parent', () => {
    const plans = flattenMasterSeed(loadMasterSeed());

    const standardKeys = new Set(
      plans.standards.map(
        (standard) => `${standard.medium}|${nameKeyOf(standard.name)}`,
      ),
    );
    const subjectKeys = new Set(
      plans.subjects.map(
        (subject) =>
          `${subject.medium}|${subject.standard}|${nameKeyOf(subject.name)}`,
      ),
    );
    const chapterKeys = new Set(
      plans.chapters.map(
        (chapter) =>
          `${chapter.medium}|${chapter.standard}|${chapter.subject}|${nameKeyOf(chapter.name)}`,
      ),
    );

    expect(
      plans.subjects.every((subject) =>
        standardKeys.has(`${subject.medium}|${nameKeyOf(subject.standard)}`),
      ),
    ).toBe(true);
    expect(
      plans.chapters.every((chapter) =>
        subjectKeys.has(
          `${chapter.medium}|${chapter.standard}|${nameKeyOf(chapter.subject)}`,
        ),
      ),
    ).toBe(true);
    expect(
      plans.topics.every((topic) =>
        chapterKeys.has(
          `${topic.medium}|${topic.standard}|${topic.subject}|${nameKeyOf(topic.chapter)}`,
        ),
      ),
    ).toBe(true);
  });
});

describe('normalizeMasterSeed', () => {
  function subject(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Physics',
      medium: 'English',
      chapters: [
        { name: 'Physical World', topics: [{ name: 'What is Physics?' }] },
      ],
      ...overrides,
    };
  }

  it('groups subjects by medium and sorts standards by order', () => {
    const seed = normalizeMasterSeed([
      {
        standard: 'Std-12',
        stream: 'Science',
        subjects: [subject({ name: 'Physics' })],
      },
      {
        standard: 'Std-11',
        stream: 'Science',
        subjects: [
          subject({ name: 'Physics' }),
          subject({ name: 'Physics', medium: 'Gujarati' }),
        ],
      },
    ]);

    expect(seed).toHaveLength(2);
    expect(seed[0]).toMatchObject({ name: 'English' });
    expect(seed[0].standards.map((entry) => entry.name)).toEqual([
      'Std-11',
      'Std-12',
    ]);
    expect(seed[1].standards[0].subjects).toHaveLength(1);
    expect(seed[1].standards[0].subjects[0].name).toBe('Physics');
  });

  it('falls back to positional order when the standard has no digits', () => {
    const seed = normalizeMasterSeed([
      {
        standard: 'Foundation',
        subjects: [subject()],
      },
      {
        standard: 'Advanced',
        subjects: [subject({ name: 'Chemistry' })],
      },
    ]);

    expect(seed).toHaveLength(1);
    expect(seed[0].standards.map((entry) => entry.name)).toEqual([
      'Foundation',
      'Advanced',
    ]);
    expect(seed[0].standards.map((entry) => entry.order)).toEqual([1, 2]);
  });

  it('rejects malformed seed data', () => {
    expect(() => normalizeMasterSeed(null)).toThrow(/must be an array/);
    expect(() => normalizeMasterSeed([])).toThrow(/root array is empty/);
    expect(() => normalizeMasterSeed([{}])).toThrow(
      /standard must be a non-empty string/,
    );
    expect(() =>
      normalizeMasterSeed([{ standard: 'Std-11', subjects: 'x' }]),
    ).toThrow(/subjects must be an array/);
    expect(() =>
      normalizeMasterSeed([
        { standard: 'Std-11', subjects: [subject({ medium: '' })] },
      ]),
    ).toThrow(/medium must be a non-empty string/);
    expect(() =>
      normalizeMasterSeed([
        { standard: 'Std-11', subjects: [subject({ chapters: 'x' })] },
      ]),
    ).toThrow(/chapters must be an array/);
    expect(() =>
      normalizeMasterSeed([
        {
          standard: 'Std-11',
          subjects: [subject({ chapters: [{ name: 'Ch', topics: 'x' }] })],
        },
      ]),
    ).toThrow(/topics must be an array/);
    expect(() =>
      normalizeMasterSeed([
        {
          standard: 'Std-11',
          subjects: [subject({ chapters: [{ name: 'Ch', topics: [{}] }] })],
        },
      ]),
    ).toThrow(/name must be a non-empty string/);
    expect(() =>
      normalizeMasterSeed([
        { standard: 'Std-11', subjects: [subject({ chapters: [null] })] },
      ]),
    ).toThrow(/must be an object/);
  });
});
