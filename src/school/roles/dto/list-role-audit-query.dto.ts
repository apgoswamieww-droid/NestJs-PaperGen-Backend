import { IsIn, IsInt, Min } from 'class-validator';

export const ROLE_AUDIT_PAGE_SIZES = [10, 25, 50] as const;

export class ListRoleAuditQueryDto {
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(ROLE_AUDIT_PAGE_SIZES)
  pageSize: number = 10;
}
