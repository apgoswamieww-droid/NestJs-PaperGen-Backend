import { IsIn } from 'class-validator';
import {
  ACCOUNT_STATUSES,
  type AccountStatus,
} from '../../../schemas/user.schema.js';

export class UpdateUserStatusDto {
  @IsIn(ACCOUNT_STATUSES)
  status: AccountStatus;
}
