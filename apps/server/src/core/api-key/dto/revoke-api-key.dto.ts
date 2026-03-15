import { IsNotEmpty, IsUUID } from 'class-validator';

export class RevokeApiKeyDto {
  @IsNotEmpty()
  @IsUUID()
  apiKeyId: string;
}
