import type { AccountStatus, UserRole } from '../../schemas/user.schema.js';

export interface SchoolUserRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: AccountStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SchoolUsersSummary {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  schoolAdmins: number;
  teachers: number;
  staff: number;
  students: number;
}

export interface SchoolUsersPage {
  items: SchoolUserRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: SchoolUsersSummary;
}

export interface GeneratedCredentials {
  email: string;
  password: string;
  sent: boolean;
}

export interface CreateUserResult {
  user: SchoolUserRecord;
  credentials: GeneratedCredentials;
}
