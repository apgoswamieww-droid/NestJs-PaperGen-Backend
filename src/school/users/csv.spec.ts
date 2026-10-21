import { describe, expect, it } from 'vitest';
import { parseCsv, toCsvField, toCsvRow } from './csv.js';

describe('parseCsv', () => {
  it('parses plain rows and trims the UTF-8 BOM', () => {
    expect(parseCsv('\uFEFFname,email\nAsha,asha@test.in\n')).toEqual([
      ['name', 'email'],
      ['Asha', 'asha@test.in'],
    ]);
  });

  it('keeps commas and newlines inside quoted fields', () => {
    expect(parseCsv('a,"b,c","line 1\nline 2"\r\n')).toEqual([
      ['a', 'b,c', 'line 1\nline 2'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', 'x']]);
  });

  it('handles blank fields and CRLF line endings', () => {
    expect(parseCsv('a,,c\r\n,,\r\n')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });

  it('rejects an unterminated quote', () => {
    expect(() => parseCsv('a,"b')).toThrow('unterminated quote');
  });
});

describe('toCsvField', () => {
  it('quotes fields containing separators', () => {
    expect(toCsvField('plain')).toBe('plain');
    expect(toCsvField('a,b')).toBe('"a,b"');
    expect(toCsvField('a"b')).toBe('"a""b"');
  });

  it('builds a row', () => {
    expect(toCsvRow(['a', 'b,c'])).toBe('a,"b,c"');
  });
});
