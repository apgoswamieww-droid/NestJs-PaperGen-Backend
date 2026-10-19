import { slugify, withSlugSuffix } from './slug.js';

describe('slugify', () => {
  it('lowercases and hyphenates a school name', () => {
    expect(slugify('Greenwood International School')).toBe(
      'greenwood-international-school',
    );
  });

  it('strips diacritics and punctuation', () => {
    expect(slugify('St. Mary\u2019s \u00c9cole #2')).toBe('st-mary-s-ecole-2');
  });

  it('collapses repeated separators and trims dashes', () => {
    expect(slugify('  --Sunrise   Public@@School--  ')).toBe(
      'sunrise-public-school',
    );
  });

  it('falls back to "school" when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('school');
    expect(slugify('')).toBe('school');
  });

  it('caps slugs at 60 characters without a trailing dash', () => {
    expect(slugify('a'.repeat(80))).toBe('a'.repeat(60));
    expect(slugify(`${'a'.repeat(59)} b`)).toBe('a'.repeat(59));
  });
});

describe('withSlugSuffix', () => {
  it('returns the base slug for the first attempt', () => {
    expect(withSlugSuffix('sunrise-public-school', 1)).toBe(
      'sunrise-public-school',
    );
  });

  it('appends the attempt number as a suffix', () => {
    expect(withSlugSuffix('sunrise-public-school', 2)).toBe(
      'sunrise-public-school-2',
    );
  });

  it('keeps the result within the 60 character budget', () => {
    expect(withSlugSuffix('a'.repeat(60), 12)).toBe(`${'a'.repeat(57)}-12`);
  });

  it('does not leave a trailing dash before the suffix', () => {
    expect(withSlugSuffix('abc-', 2)).toBe('abc-2');
  });
});
