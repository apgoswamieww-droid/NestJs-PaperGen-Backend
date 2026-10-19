import { IsIn } from 'class-validator';
import {
  TENANT_STATUSES,
  type TenantStatus,
} from '../../../schemas/tenant.schema.js';

export class UpdateSchoolStatusDto {
  @IsIn(TENANT_STATUSES)
  status: TenantStatus;
}
