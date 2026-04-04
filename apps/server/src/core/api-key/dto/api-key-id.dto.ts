import { IsNotEmpty, IsUUID } from 'class-validator';

export class ApiKeyIdDto {
  @IsNotEmpty()
  @IsUUID()
  apiKeyId: string;
}
