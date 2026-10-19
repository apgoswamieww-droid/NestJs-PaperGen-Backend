import type {
  BillingCycle,
  SubscriptionStatus,
} from '../../schemas/plan.schema.js';
import type { TenantStatus, TenantType } from '../../schemas/tenant.schema.js';
import type { UserRole } from '../../schemas/user.schema.js';

export interface AdminSchoolSummary {
  id: string;
  name: string;
  slug: string;
  type: TenantType;
  city: string;
  plan: string;
  planName: string;
  status: TenantStatus;
  brandColor: string;
  userCount: number;
  billingCycle: BillingCycle;
  subscriptionStatus: SubscriptionStatus;
  renewalAt: string | null;
  trialEndsAt: string | null;
  priceOverride: number | null;
  createdAt: string;
}

export interface AdminSchoolDetail {
  id: string;
  name: string;
  slug: string;
  type: TenantType;
  plan: string;
  planName: string;
  status: TenantStatus;
  billingCycle: BillingCycle;
  subscriptionStatus: SubscriptionStatus;
  renewalAt: string | null;
  trialEndsAt: string | null;
  priceOverride: number | null;
  createdAt: string;
  updatedAt: string;
  phone: string;
  email: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  tagline: string;
  brandColor: string;
  logo: string;
  board: string;
  affiliationNumber: string;
  principalName: string;
  academicYear: string;
  timezone: string;
}

export interface AdminSchoolStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  lockedUsers: number;
  pendingSetupUsers: number;
  activeSessions: number;
  pendingInvites: number;
  schoolAdmins: number;
  teachers: number;
  staff: number;
  students: number;
  lastLoginAt: string | null;
}

export interface AdminSchoolUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  setupPending: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminSchoolDetailResult {
  school: AdminSchoolDetail;
  stats: AdminSchoolStats;
  recentUsers: AdminSchoolUser[];
}

export interface CreateSchoolResult {
  school: AdminSchoolSummary;
  invite: {
    email: string;
    expiresInHours: number;
    sent: boolean;
  };
}

export interface ResendInviteResult {
  email: string;
  expiresInHours: number;
  sent: boolean;
}

export type ResetPasswordSendResult =
  | { kind: 'reset'; email: string; sent: boolean; expiresInMinutes: number }
  | { kind: 'invite'; email: string; sent: boolean; expiresInHours: number };
