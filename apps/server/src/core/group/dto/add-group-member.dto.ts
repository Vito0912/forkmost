import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { GroupIdDto } from './group-id.dto';

export class AddGroupMemberDto extends GroupIdDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  groupIds?: string[];
}
