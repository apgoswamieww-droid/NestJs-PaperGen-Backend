export interface QuestionOptionInput {
  key?: string;
  text?: string;
  isCorrect?: boolean;
}

export interface QuestionOptionValue {
  key: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionOptionResult {
  value: QuestionOptionValue[];
  errors: string[];
}

export const MAX_QUESTION_OPTIONS = 10;

export function normalizeQuestionOptions(
  input: readonly QuestionOptionInput[],
): QuestionOptionResult {
  const errors: string[] = [];
  const value: QuestionOptionValue[] = [];
  const keys = new Set<string>();

  input.forEach((option, index) => {
    const key =
      option.key?.trim().toUpperCase() || String.fromCharCode(65 + index);
    const text = option.text?.trim() ?? '';

    if (!text) {
      errors.push(`Option ${key} needs text.`);
    }

    if (keys.has(key)) {
      errors.push('Option keys must be unique.');
    }

    keys.add(key);
    value.push({ key, text, isCorrect: option.isCorrect === true });
  });

  if (value.length === 1) {
    errors.push('Add at least two options or leave options empty.');
  }

  if (value.length > MAX_QUESTION_OPTIONS) {
    errors.push(`Add no more than ${MAX_QUESTION_OPTIONS} options.`);
  }

  if (value.length > 0 && !value.some((option) => option.isCorrect)) {
    errors.push('Mark at least one option as correct.');
  }

  return { value, errors };
}

export function normalizeQuestionTags(input: readonly string[]): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const tag of input) {
    const text = tag.trim();
    const key = text.toLowerCase();

    if (!text || seen.has(key)) {
      continue;
    }

    seen.add(key);
    tags.push(text);
  }

  return tags;
}

export function hasQuestionAnswer(
  answer: string,
  options: readonly QuestionOptionValue[],
): boolean {
  return answer.trim() !== '' || options.some((option) => option.isCorrect);
}
