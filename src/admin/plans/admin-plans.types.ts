export interface AdminPlanLimits {
  maxStudents: number | null;
  maxTeachers: number | null;
  maxTotalUsers: number | null;
}

export interface AdminPlan {
  code: string;
  name: string;
  tagline: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  features: string[];
  limits: AdminPlanLimits;
  featured: boolean;
  active: boolean;
  sortOrder: number;
  tenantCount: number;
  createdAt: string;
  updatedAt: string;
}
