import type { QuestionStatus } from '../../schemas/question.schema.js';

export interface QuestionOptionRecord {
  key: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionListItem {
  id: string;
  text: string;
  marks: number;
  status: QuestionStatus;
  chapterId: string;
  chapterName: string;
  subjectId: string;
  subjectName: string;
  standardId: string;
  standardName: string;
  mediumId: string;
  mediumName: string;
  topicId: string | null;
  topicName: string | null;
  questionTypeId: string;
  questionTypeName: string;
  difficultyLevelId: string;
  difficultyLevelName: string;
  bloomLevelId: string | null;
  bloomLevelName: string | null;
  optionCount: number;
  hasAnswer: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface QuestionRecord extends QuestionListItem {
  options: QuestionOptionRecord[];
  answer: string;
  explanation: string;
  source: string;
  tags: string[];
  createdBy: string | null;
  updatedBy: string | null;
}

export interface QuestionsSummary {
  total: number;
  active: number;
  inactive: number;
  deleted: number;
}

export interface QuestionsPage {
  items: QuestionListItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: QuestionsSummary;
}
