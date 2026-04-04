import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  createMockAbility,
  createMockGroup,
  createMockUser,
  createMockWorkspace,
  createMockWorkspaceAbilityFactory,
  createPaginationResult,
} from '../../test-utils/test-helpers';
import { GroupController } from './group.controller';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import { GroupService } from './services/group.service';
import { GroupUserService } from './services/group-user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('GroupController', () => {
  let controller: GroupController;

  let groupService: {
    getWorkspaceGroups: jest.Mock;
    getGroupInfo: jest.Mock;
    createGroup: jest.Mock;
    updateGroup: jest.Mock;
    deleteGroup: jest.Mock;
  };
  let groupUserService: {
    getGroupUsers: jest.Mock;
    addUsersToGroupBatch: jest.Mock;
    removeUserFromGroup: jest.Mock;
  };
  let workspaceAbilityFactory: {
    createForUser: jest.Mock;
  };

  beforeEach(async () => {
    groupService = {
      getWorkspaceGroups: jest.fn(),
      getGroupInfo: jest.fn(),
      createGroup: jest.fn(),
      updateGroup: jest.fn(),
      deleteGroup: jest.fn(),
    };

    groupUserService = {
      getGroupUsers: jest.fn(),
      addUsersToGroupBatch: jest.fn(),
      removeUserFromGroup: jest.fn(),
    };

    workspaceAbilityFactory = createMockWorkspaceAbilityFactory(
      createMockAbility(),
    ) as {
      createForUser: jest.Mock;
    };

    const moduleBuilder = Test.createTestingModule({
      controllers: [GroupController],
      providers: [
        {
          provide: GroupService,
          useValue: groupService,
        },
        {
          provide: GroupUserService,
          useValue: groupUserService,
        },
        {
          provide: WorkspaceAbilityFactory,
          useValue: workspaceAbilityFactory,
        },
      ],
    });

    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: jest.fn().mockReturnValue(true),
    });

    const module: TestingModule = await moduleBuilder.compile();

    controller = module.get<GroupController>(GroupController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /groups/', () => {
    it('returns workspace groups for authorized user', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const pagination = { limit: 10, cursor: 'cursor-1', query: '', adminView: false };
      const groups = [createMockGroup(), createMockGroup({ id: 'group-id-2' })];
      const result = createPaginationResult(groups, { limit: 10 });

      groupService.getWorkspaceGroups.mockResolvedValue(result);

      await expect(
        controller.getWorkspaceGroups(pagination, user, workspace),
      ).resolves.toEqual(result);
      expect(workspaceAbilityFactory.createForUser).toHaveBeenCalledWith(
        user,
        workspace,
      );
      expect(groupService.getWorkspaceGroups).toHaveBeenCalledWith(
        workspace.id,
        pagination,
      );
    });

    it('throws ForbiddenException when read permission is denied', () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const pagination = { limit: 10, cursor: null, query: '', adminView: false };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() =>
        controller.getWorkspaceGroups(pagination, user, workspace),
      ).toThrow(ForbiddenException);
      expect(groupService.getWorkspaceGroups).not.toHaveBeenCalled();
    });

    it('checks read group permission with expected action and subject', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const pagination = { limit: 20, cursor: null, query: '', adminView: false };
      const ability = createMockAbility();

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      groupService.getWorkspaceGroups.mockResolvedValue(createPaginationResult([]));

      await controller.getWorkspaceGroups(pagination, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Read,
        WorkspaceCaslSubject.Group,
      );
    });
  });

  describe('POST /groups/info', () => {
    it('returns group info for authorized user', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const group = createMockGroup({ id: 'group-id-3' });
      const dto = { groupId: group.id };

      groupService.getGroupInfo.mockResolvedValue(group);

      await expect(controller.getGroup(dto, user, workspace)).resolves.toEqual(
        group,
      );
      expect(groupService.getGroupInfo).toHaveBeenCalledWith(
        dto.groupId,
        workspace.id,
      );
    });

    it('throws ForbiddenException when read permission is denied', () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { groupId: 'b1946997-126b-4ba4-a1de-bf80f8f2cd6f' };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() => controller.getGroup(dto, user, workspace)).toThrow(
        ForbiddenException,
      );
      expect(groupService.getGroupInfo).not.toHaveBeenCalled();
    });

    it('checks read group permission before fetching group info', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { groupId: '0730e510-82b5-48ef-9be0-6d6cc895a71d' };
      const ability = createMockAbility();

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      groupService.getGroupInfo.mockResolvedValue(createMockGroup({ id: dto.groupId }));

      await controller.getGroup(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Read,
        WorkspaceCaslSubject.Group,
      );
    });
  });

  describe('POST /groups/create', () => {
    it('creates group for authorized user', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        name: 'Engineering',
        description: 'Engineering team',
        userIds: ['0d1bf0d5-cf2b-4e56-9f78-ad6dc6dd15c5'],
      };
      const created = createMockGroup({ name: dto.name, description: dto.description });

      groupService.createGroup.mockResolvedValue(created);

      await expect(controller.createGroup(dto, user, workspace)).resolves.toEqual(
        created,
      );
      expect(groupService.createGroup).toHaveBeenCalledWith(user, workspace.id, dto);
    });

    it('throws ForbiddenException when manage permission is denied', () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { name: 'Engineering' };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() => controller.createGroup(dto, user, workspace)).toThrow(
        ForbiddenException,
      );
      expect(groupService.createGroup).not.toHaveBeenCalled();
    });

    it('checks manage group permission before creating group', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { name: 'Design' };
      const ability = createMockAbility();

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      groupService.createGroup.mockResolvedValue(createMockGroup({ name: dto.name }));

      await controller.createGroup(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Group,
      );
    });
  });

  describe('POST /groups/update', () => {
    it('updates group for authorized user', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        groupId: '757f0c63-5fb7-4a5a-b31a-6f82094989a4',
        name: 'Updated Group',
      };
      const updated = createMockGroup({ id: dto.groupId, name: dto.name });

      groupService.updateGroup.mockResolvedValue(updated);

      await expect(controller.updateGroup(dto, user, workspace)).resolves.toEqual(
        updated,
      );
      expect(groupService.updateGroup).toHaveBeenCalledWith(workspace.id, dto);
    });

    it('throws ForbiddenException when manage permission is denied', () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        groupId: '04054f42-d8be-4ecb-82e5-8d5f32f6b72c',
        name: 'Updated Group',
      };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() => controller.updateGroup(dto, user, workspace)).toThrow(
        ForbiddenException,
      );
      expect(groupService.updateGroup).not.toHaveBeenCalled();
    });

    it('checks manage group permission before updating group', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        groupId: 'c05d3f02-a9f6-4021-88a9-6f9e1f56fca2',
        name: 'Ops',
      };
      const ability = createMockAbility();

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      groupService.updateGroup.mockResolvedValue(createMockGroup({ id: dto.groupId }));

      await controller.updateGroup(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Group,
      );
    });
  });

  describe('POST /groups/members', () => {
    it('returns group members for authorized user', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const groupIdDto = { groupId: '1f2a5edf-f1f9-4467-8d4e-07272757fc75' };
      const pagination = { limit: 25, cursor: null, query: '', adminView: false };
      const result = createPaginationResult([
        { id: 'user-id-2', name: 'Member Two' },
        { id: 'user-id-3', name: 'Member Three' },
      ]);

      groupUserService.getGroupUsers.mockResolvedValue(result);

      await expect(
        controller.getGroupMembers(groupIdDto, pagination, user, workspace),
      ).resolves.toEqual(result);
      expect(groupUserService.getGroupUsers).toHaveBeenCalledWith(
        groupIdDto.groupId,
        workspace.id,
        pagination,
      );
    });

    it('throws ForbiddenException when manage permission is denied', () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const groupIdDto = { groupId: '7d5878a9-9792-471d-8f01-73af9f0054d9' };
      const pagination = { limit: 10, cursor: 'cur-x', query: '', adminView: false };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() =>
        controller.getGroupMembers(groupIdDto, pagination, user, workspace),
      ).toThrow(ForbiddenException);
      expect(groupUserService.getGroupUsers).not.toHaveBeenCalled();
    });

    it('checks manage group permission before listing group members', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const groupIdDto = { groupId: '45f8b290-f023-4dbf-a7eb-90658d4fa3d6' };
      const pagination = { limit: 15, cursor: null, query: '', adminView: false };
      const ability = createMockAbility();

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      groupUserService.getGroupUsers.mockResolvedValue(createPaginationResult([]));

      await controller.getGroupMembers(groupIdDto, pagination, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Group,
      );
    });
  });

  describe('POST /groups/members/add', () => {
    it('adds users to group for authorized user', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        groupId: '6e8f2739-c67e-4ecf-8c86-8ad602145307',
        userIds: [
          '501a5f2d-22ed-4ce3-a725-fca209f7f883',
          '06135b5f-b7e3-455f-8053-60135dd77940',
        ],
      };
      const added = { success: true, addedCount: 2 };

      groupUserService.addUsersToGroupBatch.mockResolvedValue(added);

      await expect(controller.addGroupMember(dto, user, workspace)).resolves.toEqual(
        added,
      );
      expect(groupUserService.addUsersToGroupBatch).toHaveBeenCalledWith(
        dto.userIds,
        dto.groupId,
        workspace.id,
      );
    });

    it('throws ForbiddenException when manage permission is denied', () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        groupId: '6ef7ed48-d2e4-4e9f-aaf8-947f7e5ad7a8',
        userIds: ['f715577d-14f7-4f20-b4d3-6d5d2c4fcb4f'],
      };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() => controller.addGroupMember(dto, user, workspace)).toThrow(
        ForbiddenException,
      );
      expect(groupUserService.addUsersToGroupBatch).not.toHaveBeenCalled();
    });

    it('checks manage group permission before adding group members', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        groupId: '788c5e0e-8373-407a-9809-ffde357fcb1c',
        userIds: ['d264d87c-c3cb-433c-bc2d-abff4d7ba53f'],
      };
      const ability = createMockAbility();

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      groupUserService.addUsersToGroupBatch.mockResolvedValue({ success: true });

      await controller.addGroupMember(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Group,
      );
    });
  });

  describe('POST /groups/members/remove', () => {
    it('removes user from group for authorized user', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        groupId: '4f8f77b5-d48c-4a55-a5d5-44f1d07214ad',
        userId: '42949fef-ebd0-46d9-b78f-814f9602f86d',
      };
      const removed = { success: true };

      groupUserService.removeUserFromGroup.mockResolvedValue(removed);

      await expect(
        controller.removeGroupMember(dto, user, workspace),
      ).resolves.toEqual(removed);
      expect(groupUserService.removeUserFromGroup).toHaveBeenCalledWith(
        dto.userId,
        dto.groupId,
        workspace.id,
      );
    });

    it('throws ForbiddenException when manage permission is denied', () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        groupId: '8c9283c0-3946-4cf7-8ab4-f20dc15cc9af',
        userId: 'fb617479-1517-4a7b-9f12-cd67d1f73971',
      };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() => controller.removeGroupMember(dto, user, workspace)).toThrow(
        ForbiddenException,
      );
      expect(groupUserService.removeUserFromGroup).not.toHaveBeenCalled();
    });

    it('checks manage group permission before removing group member', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        groupId: 'c6135583-968f-49a5-92bc-6380170bcb57',
        userId: '9d807233-4141-49c6-ba5a-64490e39a435',
      };
      const ability = createMockAbility();

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      groupUserService.removeUserFromGroup.mockResolvedValue({ success: true });

      await controller.removeGroupMember(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Group,
      );
    });
  });

  describe('POST /groups/delete', () => {
    it('deletes group for authorized user', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { groupId: '4f3d0e5a-d5b0-4ecf-a9f0-11140f7b9f59' };
      const response = { success: true };

      groupService.deleteGroup.mockResolvedValue(response);

      await expect(controller.deleteGroup(dto, user, workspace)).resolves.toEqual(
        response,
      );
      expect(groupService.deleteGroup).toHaveBeenCalledWith(
        dto.groupId,
        workspace.id,
      );
    });

    it('throws ForbiddenException when manage permission is denied', () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { groupId: '04d93eaf-98f6-40f0-8209-b13e85eb7d83' };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() => controller.deleteGroup(dto, user, workspace)).toThrow(
        ForbiddenException,
      );
      expect(groupService.deleteGroup).not.toHaveBeenCalled();
    });

    it('checks manage group permission before deleting group', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { groupId: '7fef1bbd-23bc-4148-96fa-7f2b9665d915' };
      const ability = createMockAbility();

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      groupService.deleteGroup.mockResolvedValue({ success: true });

      await controller.deleteGroup(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Group,
      );
    });
  });
});
