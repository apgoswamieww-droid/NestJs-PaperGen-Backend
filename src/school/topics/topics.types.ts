import type { TopicStatus } from '../../schemas/topic.schema.js';

export interface TopicRecord {
  id: string;
  name: string;
  chapterId: string;
  chapterName: string;
  subjectId: string;
  subjectName: string;
  standardId: string;
  standardName: string;
  mediumId: string;
  mediumName: string;
  order: number;
  status: TopicStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TopicsSummary {
  active: number;
  inactive: number;
  deleted: number;
}

export interface TopicsPage {
  items: TopicRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: TopicsSummary;
}
