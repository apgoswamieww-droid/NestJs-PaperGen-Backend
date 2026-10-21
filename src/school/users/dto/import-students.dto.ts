import { IsString, MaxLength } from 'class-validator';

export class ImportStudentsDto {
  @IsString()
  @MaxLength(500_000)
  csv: string;
}
