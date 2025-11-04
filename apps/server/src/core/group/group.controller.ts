import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { GroupService } from './services/group.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { GroupMemberService } from './services/group-member.service';
import { GroupIdDto } from './dto/group-id.dto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { RemoveGroupMemberDto } from './dto/remove-group-member.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';

@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupController {
  constructor(
    private readonly groupService: GroupService,
    private readonly groupMemberService: GroupMemberService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  getWorkspaceGroups(
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Group)) {
      throw new ForbiddenException();
    }

    return this.groupService.getWorkspaceGroups(workspace.id, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/info')
  getGroup(
    @Body() groupIdDto: GroupIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Group)) {
      throw new ForbiddenException();
    }
    return this.groupService.getGroupInfo(groupIdDto.groupId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  createGroup(
    @Body() createGroupDto: CreateGroupDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group)
    ) {
      throw new ForbiddenException();
    }
    return this.groupService.createGroup(user, workspace.id, createGroupDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  updateGroup(
    @Body() updateGroupDto: UpdateGroupDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group)
    ) {
      throw new ForbiddenException();
    }

    return this.groupService.updateGroup(workspace.id, updateGroupDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('members')
  getGroupMembers(
    @Body() groupIdDto: GroupIdDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group)) {
      throw new ForbiddenException();
    }

    return this.groupMemberService.getGroupMembers(
      groupIdDto.groupId,
      pagination,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('members/recursive')
  getGroupMembersRecursive(
    @Body() groupIdDto: GroupIdDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group)) {
      throw new ForbiddenException();
    }

    return this.groupMemberService.getGroupMembersRecursive(
      groupIdDto.groupId,
      pagination,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('members/add')
  async addGroupMember(
    @Body() addGroupMemberDto: AddGroupMemberDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group)
    ) {
      throw new ForbiddenException();
    }

    // Validate that at least one of userIds or groupIds is provided
    if (
      (!addGroupMemberDto.userIds || addGroupMemberDto.userIds.length === 0) &&
      (!addGroupMemberDto.groupIds || addGroupMemberDto.groupIds.length === 0)
    ) {
      throw new BadRequestException('userIds or groupIds is required');
    }

    // Add users if provided
    if (addGroupMemberDto.userIds && addGroupMemberDto.userIds.length > 0) {
      await this.groupMemberService.addUsersToGroupBatch(
        addGroupMemberDto.userIds,
        addGroupMemberDto.groupId,
        workspace.id,
      );
    }

    // Add groups if provided
    if (addGroupMemberDto.groupIds && addGroupMemberDto.groupIds.length > 0) {
      await this.groupMemberService.addGroupsToGroupBatch(
        addGroupMemberDto.groupIds,
        addGroupMemberDto.groupId,
        workspace.id,
      );
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('members/remove')
  removeGroupMember(
    @Body() removeGroupMemberDto: RemoveGroupMemberDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group)
    ) {
      throw new ForbiddenException();
    }

    // Validate that either userId or memberGroupId is provided
    if (!removeGroupMemberDto.userId && !removeGroupMemberDto.memberGroupId) {
      throw new BadRequestException('userId or memberGroupId is required');
    }

    if (removeGroupMemberDto.userId && removeGroupMemberDto.memberGroupId) {
      throw new BadRequestException(
        'please provide either a userId or memberGroupId, not both',
      );
    }

    if (removeGroupMemberDto.userId) {
      return this.groupMemberService.removeUserFromGroup(
        removeGroupMemberDto.userId,
        removeGroupMemberDto.groupId,
      );
    } else {
      return this.groupMemberService.removeGroupFromGroup(
        removeGroupMemberDto.memberGroupId,
        removeGroupMemberDto.groupId,
      );
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  deleteGroup(
    @Body() groupIdDto: GroupIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group)
    ) {
      throw new ForbiddenException();
    }
    return this.groupService.deleteGroup(groupIdDto.groupId, workspace.id);
  }
}
