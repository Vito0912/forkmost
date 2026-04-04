import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';

export class UpdateApiKeyDto {
  @IsNotEmpty()
  @IsUUID()
  apiKeyId: string;

  @MinLength(1)
  @MaxLength(250)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;
}
