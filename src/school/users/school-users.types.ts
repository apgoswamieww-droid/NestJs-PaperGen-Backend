import type {
  AccountStatus,
  ScienceGroup,
  StudentGender,
  StudentStream,
} from '../../schemas/user.schema.js';

export interface StudentProfileRecord {
  surname: string;
  firstName: string;
  lastName: string;
  grNumber: string;
  rollNumber: string;
  fatherFullName: string;
  motherFullName: string;
  gender: StudentGender | null;
  dateOfBirth: string | null;
  address: string;
  mobile: string;
  whatsappNumber: string;
  stream: StudentStream | null;
  scienceGroup: ScienceGroup | null;
  subjectIds: string[];
  aadhaarNumber: string;
  mediumId: string | null;
  standardId: string | null;
}

export interface SchoolUserRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  studentProfile: StudentProfileRecord | null;
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

export interface StudentImportRowResult {
  row: number;
  name: string;
  email: string;
  status: 'created' | 'failed';
  error: string | null;
  password: string | null;
}

export interface StudentImportResult {
  total: number;
  created: number;
  failed: number;
  results: StudentImportRowResult[];
}
