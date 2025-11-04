import {
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { GroupMemberRepo } from '@docmost/db/repos/group/group-member.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { GroupService } from './group.service';

@Injectable()
export class GroupMemberService {
  constructor(
    private groupMemberRepo: GroupMemberRepo,
    @Inject(forwardRef(() => GroupService))
    private groupService: GroupService,
  ) {}

  async getGroupMembers(groupId: string, pagination: PaginationOptions) {
    return this.groupMemberRepo.getGroupMembersPaginated(groupId, pagination);
  }

  async getGroupMembersRecursive(groupId: string, pagination: PaginationOptions) {
    return this.groupMemberRepo.getGroupMembersRecursive(groupId, pagination);
  }

  async addUserToGroup(
    userId: string,
    groupId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.groupMemberRepo.addUserToGroup(userId, groupId, workspaceId);
  }

  async addGroupToGroup(
    memberGroupId: string,
    parentGroupId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.groupMemberRepo.addGroupToGroup(
      memberGroupId,
      parentGroupId,
      workspaceId,
    );
  }

  async addUsersToGroupBatch(
    userIds: string[],
    groupId: string,
    workspaceId: string,
  ): Promise<void> {
    for (const userId of userIds) {
      await this.addUserToGroup(userId, groupId, workspaceId);
    }
  }

  async addGroupsToGroupBatch(
    memberGroupIds: string[],
    parentGroupId: string,
    workspaceId: string,
  ): Promise<void> {
    for (const memberGroupId of memberGroupIds) {
      await this.addGroupToGroup(memberGroupId, parentGroupId, workspaceId);
    }
  }

  async removeUserFromGroup(
    userId: string,
    groupId: string,
  ): Promise<void> {
    await this.groupMemberRepo.delete(groupId, { userId });
  }

  async removeGroupFromGroup(
    memberGroupId: string,
    parentGroupId: string,
  ): Promise<void> {
    await this.groupMemberRepo.delete(parentGroupId, { memberGroupId });
  }

  async getAllUserIdsInGroup(groupId: string): Promise<string[]> {
    return this.groupMemberRepo.getAllUserIdsInGroup(groupId);
  }
}
