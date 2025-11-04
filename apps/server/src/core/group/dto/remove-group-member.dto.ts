import { IsOptional, IsUUID } from 'class-validator';
import { GroupIdDto } from './group-id.dto';

export class RemoveGroupMemberDto extends GroupIdDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  memberGroupId?: string;
}
