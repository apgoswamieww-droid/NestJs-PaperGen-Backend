import type { SubjectStatus } from '../../schemas/subject.schema.js';

export interface SubjectRecord {
  id: string;
  name: string;
  standardId: string;
  standardName: string;
  mediumId: string;
  mediumName: string;
  order: number;
  status: SubjectStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SubjectsSummary {
  active: number;
  inactive: number;
  deleted: number;
}

export interface SubjectsPage {
  items: SubjectRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: SubjectsSummary;
}
