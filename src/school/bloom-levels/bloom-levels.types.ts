import type { BloomLevelStatus } from '../../schemas/bloom-level.schema.js';

export interface BloomLevelRecord {
  id: string;
  name: string;
  order: number;
  status: BloomLevelStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BloomLevelsSummary {
  active: number;
  inactive: number;
  deleted: number;
}

export interface BloomLevelsPage {
  items: BloomLevelRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: BloomLevelsSummary;
}
