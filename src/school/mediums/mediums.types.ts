import type { MediumStatus } from '../../schemas/medium.schema.js';

export interface MediumRecord {
  id: string;
  name: string;
  status: MediumStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MediumsSummary {
  active: number;
  inactive: number;
  deleted: number;
}

export interface MediumsPage {
  items: MediumRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: MediumsSummary;
}
