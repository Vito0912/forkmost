import { Module } from '@nestjs/common';
import { GroupService } from './services/group.service';
import { GroupController } from './group.controller';
import { GroupMemberService } from './services/group-member.service';

@Module({
  controllers: [GroupController],
  providers: [GroupService, GroupMemberService],
  exports: [GroupService, GroupMemberService],
})
export class GroupModule {}
