import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsMongoId,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  SCIENCE_GROUPS,
  STUDENT_GENDERS,
  STUDENT_STREAMS,
} from '../../../schemas/user.schema.js';

const MOBILE_PATTERN = /^[6-9]\d{9}$/;
const AADHAAR_PATTERN = /^\d{12}$/;

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function blankToUndefined({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const text = value.trim();

  return text === '' ? undefined : text;
}

export class StudentProfileDto {
  @Transform(trimmed)
  @ValidateIf((dto: StudentProfileDto) => dto.surname !== undefined)
  @IsString()
  @MaxLength(60)
  surname?: string;

  @Transform(trimmed)
  @ValidateIf((dto: StudentProfileDto) => dto.firstName !== undefined)
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @Transform(trimmed)
  @ValidateIf((dto: StudentProfileDto) => dto.lastName !== undefined)
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @Transform(trimmed)
  @ValidateIf((dto: StudentProfileDto) => dto.grNumber !== undefined)
  @IsString()
  @MaxLength(30)
  grNumber?: string;

  @Transform(trimmed)
  @ValidateIf((dto: StudentProfileDto) => dto.rollNumber !== undefined)
  @IsString()
  @MaxLength(30)
  rollNumber?: string;

  @Transform(trimmed)
  @ValidateIf((dto: StudentProfileDto) => dto.fatherFullName !== undefined)
  @IsString()
  @MaxLength(120)
  fatherFullName?: string;

  @Transform(trimmed)
  @ValidateIf((dto: StudentProfileDto) => dto.motherFullName !== undefined)
  @IsString()
  @MaxLength(120)
  motherFullName?: string;

  @Transform(blankToUndefined)
  @ValidateIf((dto: StudentProfileDto) => dto.gender !== undefined)
  @IsIn(STUDENT_GENDERS)
  gender?: string;

  @Transform(blankToUndefined)
  @ValidateIf((dto: StudentProfileDto) => dto.dateOfBirth !== undefined)
  @IsDateString({}, { message: 'dateOfBirth must be a valid date.' })
  dateOfBirth?: string;

  @Transform(trimmed)
  @ValidateIf((dto: StudentProfileDto) => dto.address !== undefined)
  @IsString()
  @MaxLength(400)
  address?: string;

  @Transform(blankToUndefined)
  @ValidateIf((dto: StudentProfileDto) => dto.mobile !== undefined)
  @Matches(MOBILE_PATTERN, {
    message: 'mobile must be a 10-digit mobile number.',
  })
  mobile?: string;

  @Transform(blankToUndefined)
  @ValidateIf((dto: StudentProfileDto) => dto.whatsappNumber !== undefined)
  @Matches(MOBILE_PATTERN, {
    message: 'whatsappNumber must be a 10-digit mobile number.',
  })
  whatsappNumber?: string;

  @Transform(blankToUndefined)
  @ValidateIf((dto: StudentProfileDto) => dto.stream !== undefined)
  @IsIn(STUDENT_STREAMS)
  stream?: string;

  @Transform(blankToUndefined)
  @ValidateIf((dto: StudentProfileDto) => dto.scienceGroup !== undefined)
  @IsIn(SCIENCE_GROUPS)
  scienceGroup?: string;

  @Transform(blankToUndefined)
  @ValidateIf((dto: StudentProfileDto) => dto.aadhaarNumber !== undefined)
  @Matches(AADHAAR_PATTERN, { message: 'aadhaarNumber must be 12 digits.' })
  aadhaarNumber?: string;

  @Transform(blankToUndefined)
  @ValidateIf((dto: StudentProfileDto) => dto.mediumId !== undefined)
  @IsMongoId({ message: 'mediumId must be a valid medium.' })
  mediumId?: string;

  @Transform(blankToUndefined)
  @ValidateIf((dto: StudentProfileDto) => dto.standardId !== undefined)
  @IsMongoId({ message: 'standardId must be a valid standard.' })
  standardId?: string;

  @ValidateIf((dto: StudentProfileDto) => dto.subjectIds !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @IsMongoId({ each: true, message: 'subjectIds contains an invalid subject.' })
  subjectIds?: string[];
}
