import type {
  ChapterReferenceType,
  ChapterStatus,
} from '../../schemas/chapter.schema.js';

export interface ChapterRecord {
  id: string;
  name: string;
  subjectId: string;
  subjectName: string;
  standardId: string;
  standardName: string;
  mediumId: string;
  mediumName: string;
  referenceType: ChapterReferenceType;
  order: number;
  status: ChapterStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ChaptersSummary {
  active: number;
  inactive: number;
  deleted: number;
}

export interface ChaptersPage {
  items: ChapterRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: ChaptersSummary;
}
