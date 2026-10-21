import type { QuestionTypeStatus } from '../../schemas/question-type.schema.js';

export interface QuestionTypeRecord {
  id: string;
  name: string;
  order: number;
  status: QuestionTypeStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface QuestionTypesSummary {
  active: number;
  inactive: number;
  deleted: number;
}

export interface QuestionTypesPage {
  items: QuestionTypeRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: QuestionTypesSummary;
}
