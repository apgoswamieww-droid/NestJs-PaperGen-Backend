import type { DifficultyLevelStatus } from '../../schemas/difficulty-level.schema.js';

export interface DifficultyLevelRecord {
  id: string;
  name: string;
  order: number;
  status: DifficultyLevelStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DifficultyLevelsSummary {
  active: number;
  inactive: number;
  deleted: number;
}

export interface DifficultyLevelsPage {
  items: DifficultyLevelRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: DifficultyLevelsSummary;
}
