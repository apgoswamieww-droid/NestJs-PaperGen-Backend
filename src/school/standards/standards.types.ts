import type { StandardStatus } from '../../schemas/standard.schema.js';

export interface StandardRecord {
  id: string;
  name: string;
  mediumId: string;
  mediumName: string;
  order: number;
  status: StandardStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StandardsSummary {
  active: number;
  inactive: number;
  deleted: number;
}

export interface StandardsPage {
  items: StandardRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: StandardsSummary;
}
