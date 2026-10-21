import { describe, expect, it } from 'vitest';
import {
  hasQuestionAnswer,
  normalizeQuestionOptions,
  normalizeQuestionTags,
} from './question-options.js';

describe('normalizeQuestionOptions', () => {
  it('trims text and fills missing keys in sequence', () => {
    const result = normalizeQuestionOptions([
      { text: ' First ', isCorrect: true },
      { key: ' b ', text: 'Second', isCorrect: false },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.value).toEqual([
      { key: 'A', text: 'First', isCorrect: true },
      { key: 'B', text: 'Second', isCorrect: false },
    ]);
  });

  it('rejects duplicate option keys case-insensitively', () => {
    const result = normalizeQuestionOptions([
      { key: 'a', text: 'First', isCorrect: true },
      { key: 'A', text: 'Second', isCorrect: false },
    ]);

    expect(result.errors).toContain('Option keys must be unique.');
  });

  it('rejects blank option text', () => {
    const result = normalizeQuestionOptions([
      { key: 'A', text: ' ', isCorrect: true },
      { key: 'B', text: 'Second', isCorrect: false },
    ]);

    expect(result.errors).toContain('Option A needs text.');
  });

  it('requires two options when options are supplied', () => {
    const result = normalizeQuestionOptions([
      { text: 'Only', isCorrect: true },
    ]);

    expect(result.errors).toContain(
      'Add at least two options or leave options empty.',
    );
  });

  it('requires at least one correct option', () => {
    const result = normalizeQuestionOptions([
      { text: 'First', isCorrect: false },
      { text: 'Second', isCorrect: false },
    ]);

    expect(result.errors).toContain('Mark at least one option as correct.');
  });

  it('rejects more than ten options', () => {
    const result = normalizeQuestionOptions(
      Array.from({ length: 11 }, (_, index) => ({
        text: `Option ${index}`,
        isCorrect: index === 0,
      })),
    );

    expect(result.errors).toContain('Add no more than 10 options.');
  });
});

describe('normalizeQuestionTags', () => {
  it('trims tags and removes case-insensitive duplicates', () => {
    expect(
      normalizeQuestionTags([' Algebra ', 'algebra', '', 'Geometry']),
    ).toEqual(['Algebra', 'Geometry']);
  });
});

describe('hasQuestionAnswer', () => {
  it('accepts written answers and correct options', () => {
    expect(hasQuestionAnswer(' 42 ', [])).toBe(true);
    expect(
      hasQuestionAnswer('', [{ key: 'A', text: 'One', isCorrect: true }]),
    ).toBe(true);
  });

  it('rejects empty answers without a correct option', () => {
    expect(
      hasQuestionAnswer(' ', [{ key: 'A', text: 'One', isCorrect: false }]),
    ).toBe(false);
  });
});
