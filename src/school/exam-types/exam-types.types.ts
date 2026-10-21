import type { ExamTypeStatus } from '../../schemas/exam-type.schema.js';

export interface ExamTypeRecord {
  id: string;
  name: string;
  order: number;
  status: ExamTypeStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExamTypesSummary {
  active: number;
  inactive: number;
  deleted: number;
}

export interface ExamTypesPage {
  items: ExamTypeRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: ExamTypesSummary;
}
