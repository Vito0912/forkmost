import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { findHighestUserSpaceRole } from '@docmost/db/repos/space/utils';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SpaceController } from './space.controller';
import { SpaceService } from './services/space.service';
import { SpaceMemberService } from './services/space-member.service';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import {
  createMockAbility,
  createMockSpace,
  createMockSpaceAbilityFactory,
  createMockUser,
  createMockWorkspace,
  createMockWorkspaceAbilityFactory,
  createPaginationResult,
} from '../../test-utils/test-helpers';

jest.mock('./services/space.service', () => ({
  SpaceService: class SpaceService {},
}));

jest.mock('./services/space-member.service', () => ({
  SpaceMemberService: class SpaceMemberService {},
}));

jest.mock('@docmost/db/repos/space/utils', () => ({
  findHighestUserSpaceRole: jest.fn(),
}));

describe('SpaceController', () => {
  let controller: SpaceController;

  let spaceService: {
    getSpaceInfo: jest.Mock;
    getSpaceGraph: jest.Mock;
    createSpace: jest.Mock;
    updateSpace: jest.Mock;
    deleteSpace: jest.Mock;
  };
  let spaceMemberService: {
    getUserSpaces: jest.Mock;
    getSpaceMembers: jest.Mock;
    addMembersToSpaceBatch: jest.Mock;
    removeMemberFromSpace: jest.Mock;
    updateSpaceMemberRole: jest.Mock;
  };
  let spaceMemberRepo: {
    getUserSpaceRoles: jest.Mock;
  };
  let spaceAbilityFactory: {
    createForUser: jest.Mock;
  };
  let workspaceAbilityFactory: {
    createForUser: jest.Mock;
  };

  const mockedFindHighestUserSpaceRole = findHighestUserSpaceRole as jest.Mock;
  const createPagination = (
    overrides: Record<string, string | number | boolean | null | undefined> = {},
  ) => ({
    limit: 20,
    cursor: null,
    beforeCursor: undefined,
    query: '',
    adminView: false,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    spaceService = {
      getSpaceInfo: jest.fn(),
      getSpaceGraph: jest.fn(),
      createSpace: jest.fn(),
      updateSpace: jest.fn(),
      deleteSpace: jest.fn(),
    };
    spaceMemberService = {
      getUserSpaces: jest.fn(),
      getSpaceMembers: jest.fn(),
      addMembersToSpaceBatch: jest.fn(),
      removeMemberFromSpace: jest.fn(),
      updateSpaceMemberRole: jest.fn(),
    };
    spaceMemberRepo = {
      getUserSpaceRoles: jest.fn(),
    };
    spaceAbilityFactory = createMockSpaceAbilityFactory(createMockAbility()) as {
      createForUser: jest.Mock;
    };
    workspaceAbilityFactory = createMockWorkspaceAbilityFactory(
      createMockAbility(),
    ) as {
      createForUser: jest.Mock;
    };

    const moduleBuilder = Test.createTestingModule({
      controllers: [SpaceController],
      providers: [
        {
          provide: SpaceService,
          useValue: spaceService,
        },
        {
          provide: SpaceMemberService,
          useValue: spaceMemberService,
        },
        {
          provide: SpaceMemberRepo,
          useValue: spaceMemberRepo,
        },
        {
          provide: SpaceAbilityFactory,
          useValue: spaceAbilityFactory,
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

    controller = module.get<SpaceController>(SpaceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getWorkspaceSpaces', () => {
    it('returns user spaces with pagination', async () => {
      const user = createMockUser();
      const pagination = createPagination({ limit: 10, cursor: 'cur-1' });
      const spaces = [createMockSpace(), createMockSpace({ id: 'space-id-2' })];
      const result = createPaginationResult(spaces, { limit: 10 });

      spaceMemberService.getUserSpaces.mockResolvedValue(result);

      await expect(
        controller.getWorkspaceSpaces(pagination, user),
      ).resolves.toEqual(result);
      expect(spaceMemberService.getUserSpaces).toHaveBeenCalledWith(
        user.id,
        pagination,
      );
    });

    it('returns empty paginated list when no spaces are found', async () => {
      const user = createMockUser();
      const pagination = createPagination({ limit: 25 });
      const result = createPaginationResult([], { limit: 25 });

      spaceMemberService.getUserSpaces.mockResolvedValue(result);

      await expect(
        controller.getWorkspaceSpaces(pagination, user),
      ).resolves.toEqual(result);
    });

    it('passes through pagination values exactly as provided', async () => {
      const user = createMockUser();
      const pagination = createPagination({ limit: 50, cursor: 'next-cursor' });
      const result = createPaginationResult([createMockSpace()]);

      spaceMemberService.getUserSpaces.mockResolvedValue(result);

      await controller.getWorkspaceSpaces(pagination, user);

      expect(spaceMemberService.getUserSpaces).toHaveBeenCalledTimes(1);
      expect(spaceMemberService.getUserSpaces).toHaveBeenCalledWith(
        user.id,
        pagination,
      );
    });
  });

  describe('getSpaceGraph', () => {
    it('returns graph when space exists and user can read pages', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const space = createMockSpace();
      const dto = { spaceId: space.id };
      const graph = { nodes: [{ id: 'n1' }], edges: [{ from: 'n1', to: 'n2' }] };

      spaceService.getSpaceInfo.mockResolvedValue(space);
      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceService.getSpaceGraph.mockResolvedValue(graph);

      await expect(
        controller.getSpaceGraph(dto, user, workspace),
      ).resolves.toEqual(graph);
      expect(spaceService.getSpaceInfo).toHaveBeenCalledWith(
        dto.spaceId,
        workspace.id,
      );
      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(
        user,
        space.id,
      );
      expect(spaceService.getSpaceGraph).toHaveBeenCalledWith(
        dto.spaceId,
        workspace.id,
      );
    });

    it('throws NotFoundException when space does not exist', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { spaceId: 'space-id-404' };

      spaceService.getSpaceInfo.mockResolvedValue(null);

      await expect(controller.getSpaceGraph(dto, user, workspace)).rejects.toThrow(
        new NotFoundException('Space not found'),
      );
      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
      expect(spaceService.getSpaceGraph).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when user cannot read pages', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const space = createMockSpace();
      const dto = { spaceId: space.id };

      spaceService.getSpaceInfo.mockResolvedValue(space);
      spaceAbilityFactory.createForUser.mockResolvedValue(
        createMockAbility({ can: false }),
      );

      await expect(controller.getSpaceGraph(dto, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
      expect(spaceService.getSpaceGraph).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when graph is missing', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const space = createMockSpace();
      const dto = { spaceId: space.id };

      spaceService.getSpaceInfo.mockResolvedValue(space);
      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceService.getSpaceGraph.mockResolvedValue(null);

      await expect(controller.getSpaceGraph(dto, user, workspace)).rejects.toThrow(
        new NotFoundException('Graph not found'),
      );
    });

    it('checks page read permission with the expected action and subject', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const space = createMockSpace();
      const dto = { spaceId: space.id };
      const ability = createMockAbility();

      spaceService.getSpaceInfo.mockResolvedValue(space);
      spaceAbilityFactory.createForUser.mockResolvedValue(ability);
      spaceService.getSpaceGraph.mockResolvedValue({ nodes: [], edges: [] });

      await controller.getSpaceGraph(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Read,
        SpaceCaslSubject.Page,
      );
    });
  });

  describe('getSpaceInfo', () => {
    it('returns space info with membership when authorized', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const space = createMockSpace();
      const dto = { spaceId: space.id };
      const roles = ['reader', 'writer'];
      const highestRole = 'writer';
      const ability = createMockAbility();
      ability.rules = [{ action: 'read', subject: 'settings' }];

      spaceService.getSpaceInfo.mockResolvedValue(space);
      spaceAbilityFactory.createForUser.mockResolvedValue(ability);
      spaceMemberRepo.getUserSpaceRoles.mockResolvedValue(roles);
      mockedFindHighestUserSpaceRole.mockReturnValue(highestRole);

      await expect(controller.getSpaceInfo(dto, user, workspace)).resolves.toEqual({
        ...space,
        membership: {
          userId: user.id,
          role: highestRole,
          permissions: ability.rules,
        },
      });
      expect(spaceMemberRepo.getUserSpaceRoles).toHaveBeenCalledWith(
        user.id,
        space.id,
      );
      expect(mockedFindHighestUserSpaceRole).toHaveBeenCalledWith(roles);
    });

    it('throws NotFoundException when space is missing', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();

      spaceService.getSpaceInfo.mockResolvedValue(null);

      await expect(
        controller.getSpaceInfo({ spaceId: 'missing-space' }, user, workspace),
      ).rejects.toThrow(new NotFoundException('Space not found'));
      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
      expect(spaceMemberRepo.getUserSpaceRoles).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when user cannot read settings', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const space = createMockSpace();

      spaceService.getSpaceInfo.mockResolvedValue(space);
      spaceAbilityFactory.createForUser.mockResolvedValue(
        createMockAbility({ can: false }),
      );

      await expect(
        controller.getSpaceInfo({ spaceId: space.id }, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(spaceMemberRepo.getUserSpaceRoles).not.toHaveBeenCalled();
    });

    it('checks settings permission with expected action and subject', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const space = createMockSpace();
      const ability = createMockAbility();

      spaceService.getSpaceInfo.mockResolvedValue(space);
      spaceAbilityFactory.createForUser.mockResolvedValue(ability);
      spaceMemberRepo.getUserSpaceRoles.mockResolvedValue(['admin']);
      mockedFindHighestUserSpaceRole.mockReturnValue('admin');

      await controller.getSpaceInfo({ spaceId: space.id }, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Read,
        SpaceCaslSubject.Settings,
      );
    });

    it('calls space lookup with workspace-scoped arguments', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace({ id: 'workspace-id-custom' });
      const space = createMockSpace({ id: 'space-id-custom' });

      spaceService.getSpaceInfo.mockResolvedValue(space);
      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceMemberRepo.getUserSpaceRoles.mockResolvedValue(['reader']);
      mockedFindHighestUserSpaceRole.mockReturnValue('reader');

      await controller.getSpaceInfo({ spaceId: space.id }, user, workspace);

      expect(spaceService.getSpaceInfo).toHaveBeenCalledWith(
        space.id,
        workspace.id,
      );
    });

    it('returns membership role from findHighestUserSpaceRole', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const space = createMockSpace();

      spaceService.getSpaceInfo.mockResolvedValue(space);
      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceMemberRepo.getUserSpaceRoles.mockResolvedValue(['reader', 'admin']);
      mockedFindHighestUserSpaceRole.mockReturnValue('admin');

      const result = await controller.getSpaceInfo(
        { spaceId: space.id },
        user,
        workspace,
      );

      expect(result.membership.role).toBe('admin');
    });
  });

  describe('createSpace', () => {
    it('creates a space when workspace permission is granted', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { name: 'Engineering', slug: 'engineering', description: 'Docs' };
      const created = createMockSpace({ name: dto.name, slug: dto.slug });

      workspaceAbilityFactory.createForUser.mockReturnValue(createMockAbility());
      spaceService.createSpace.mockResolvedValue(created);

      await expect(controller.createSpace(dto, user, workspace)).resolves.toEqual(
        created,
      );
      expect(workspaceAbilityFactory.createForUser).toHaveBeenCalledWith(
        user,
        workspace,
      );
      expect(spaceService.createSpace).toHaveBeenCalledWith(
        user,
        workspace.id,
        dto,
      );
    });

    it('throws ForbiddenException when workspace space-manage permission is denied', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { name: 'Engineering', slug: 'engineering' };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() => controller.createSpace(dto, user, workspace)).toThrow(
        ForbiddenException,
      );
      expect(spaceService.createSpace).not.toHaveBeenCalled();
    });

    it('checks workspace manage-space permission with expected action and subject', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { name: 'Engineering', slug: 'engineering' };
      const ability = createMockAbility();

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      spaceService.createSpace.mockResolvedValue(createMockSpace());

      await controller.createSpace(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Space,
      );
    });
  });

  describe('updateSpace', () => {
    it('updates a space when authorized', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: 'fb7f8b1d-43f4-4523-b932-cb327f076bb7',
        name: 'Updated Name',
        disablePublicSharing: false,
      };
      const updated = createMockSpace({ id: dto.spaceId, name: dto.name });

      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceService.updateSpace.mockResolvedValue(updated);

      await expect(controller.updateSpace(dto, user, workspace)).resolves.toEqual(
        updated,
      );
      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(
        user,
        dto.spaceId,
      );
      expect(spaceService.updateSpace).toHaveBeenCalledWith(dto, workspace.id);
    });

    it('throws ForbiddenException when settings manage permission is denied', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: '18c415eb-72ec-4883-bee3-4f22bbf74256',
        name: 'Updated Name',
        disablePublicSharing: false,
      };

      spaceAbilityFactory.createForUser.mockResolvedValue(
        createMockAbility({ can: false }),
      );

      await expect(controller.updateSpace(dto, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
      expect(spaceService.updateSpace).not.toHaveBeenCalled();
    });

    it('checks manage settings permission before update', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: 'd08a9c8e-3ccf-4a58-b057-fbf56ef45f5c',
        name: 'Updated Name',
        disablePublicSharing: false,
      };
      const ability = createMockAbility();

      spaceAbilityFactory.createForUser.mockResolvedValue(ability);
      spaceService.updateSpace.mockResolvedValue(createMockSpace());

      await controller.updateSpace(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Manage,
        SpaceCaslSubject.Settings,
      );
    });
  });

  describe('deleteSpace', () => {
    it('deletes a space when authorized', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { spaceId: '76db8ff1-a491-48f0-b589-622b7ec8f6b9' };
      const response = { success: true };

      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceService.deleteSpace.mockResolvedValue(response);

      await expect(controller.deleteSpace(dto, user, workspace)).resolves.toEqual(
        response,
      );
      expect(spaceService.deleteSpace).toHaveBeenCalledWith(
        dto.spaceId,
        workspace.id,
      );
    });

    it('throws ForbiddenException when settings manage permission is denied', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { spaceId: '848ce0e2-d84a-4d59-b9ca-57706897f4fc' };

      spaceAbilityFactory.createForUser.mockResolvedValue(
        createMockAbility({ can: false }),
      );

      await expect(controller.deleteSpace(dto, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
      expect(spaceService.deleteSpace).not.toHaveBeenCalled();
    });

    it('checks manage settings permission before delete', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { spaceId: '875887b0-0c48-4e23-842e-96a0a80ee835' };
      const ability = createMockAbility();

      spaceAbilityFactory.createForUser.mockResolvedValue(ability);
      spaceService.deleteSpace.mockResolvedValue({ success: true });

      await controller.deleteSpace(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Manage,
        SpaceCaslSubject.Settings,
      );
    });
  });

  describe('getSpaceMembers', () => {
    it('returns paginated members when authorized', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const space = createMockSpace();
      const dto = { spaceId: space.id };
      const pagination = createPagination({ limit: 20 });
      const result = createPaginationResult(
        [{ userId: 'user-id-2', role: 'reader' }],
        { limit: 20 },
      );

      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceMemberService.getSpaceMembers.mockResolvedValue(result);

      await expect(
        controller.getSpaceMembers(dto, pagination, user, workspace),
      ).resolves.toEqual(
        result,
      );
      expect(spaceMemberService.getSpaceMembers).toHaveBeenCalledWith(
        dto.spaceId,
        workspace.id,
        pagination,
      );
    });

    it('throws ForbiddenException when read member permission is denied', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { spaceId: '4db1f7d1-b031-44ec-8f9c-6bf5fedf09da' };
      const pagination = createPagination();

      spaceAbilityFactory.createForUser.mockResolvedValue(
        createMockAbility({ can: false }),
      );

      await expect(
        controller.getSpaceMembers(dto, pagination, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(spaceMemberService.getSpaceMembers).not.toHaveBeenCalled();
    });

    it('checks read member permission with expected action and subject', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { spaceId: '3b73d410-2e5e-4008-b76a-af4dd4ab8cf4' };
      const pagination = createPagination({ limit: 10 });
      const ability = createMockAbility();

      spaceAbilityFactory.createForUser.mockResolvedValue(ability);
      spaceMemberService.getSpaceMembers.mockResolvedValue(
        createPaginationResult([]),
      );

      await controller.getSpaceMembers(dto, pagination, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Read,
        SpaceCaslSubject.Member,
      );
    });
  });

  describe('addSpaceMember', () => {
    it('adds users to a space when authorized', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: '95be1e2e-a627-4996-919f-285486e90e4c',
        role: 'reader',
        userIds: ['cf9adf01-f77a-4f37-9899-16ea98f57522'],
        groupIds: [],
      };
      const response = [{ id: 'membership-id-1' }];

      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceMemberService.addMembersToSpaceBatch.mockResolvedValue(response);

      await expect(controller.addSpaceMember(dto, user, workspace)).resolves.toEqual(
        response,
      );
      expect(spaceMemberService.addMembersToSpaceBatch).toHaveBeenCalledWith(
        dto,
        user,
        workspace.id,
      );
    });

    it('adds groups to a space when authorized', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: 'f1162998-9e89-41d4-8708-2584ad58f03f',
        role: 'writer',
        userIds: [],
        groupIds: ['eeb5761f-f122-4c8e-bb91-a3d6ad303bfe'],
      };
      const response = [{ id: 'membership-id-2' }];

      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceMemberService.addMembersToSpaceBatch.mockResolvedValue(response);

      await expect(controller.addSpaceMember(dto, user, workspace)).resolves.toEqual(
        response,
      );
    });

    it('throws BadRequestException when both userIds and groupIds are empty', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: '84b51f20-87ee-42f3-a8e9-548ddf0d8bf1',
        role: 'reader',
        userIds: [],
        groupIds: [],
      };

      await expect(controller.addSpaceMember(dto, user, workspace)).rejects.toThrow(
        new BadRequestException('userIds or groupIds is required'),
      );
      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
      expect(spaceMemberService.addMembersToSpaceBatch).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when manage member permission is denied', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: '57ec0974-9746-48cd-8957-1426a12f9293',
        role: 'reader',
        userIds: ['6d133497-31e2-4df3-9687-97bcafbe7167'],
        groupIds: [],
      };

      spaceAbilityFactory.createForUser.mockResolvedValue(
        createMockAbility({ can: false }),
      );

      await expect(controller.addSpaceMember(dto, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
      expect(spaceMemberService.addMembersToSpaceBatch).not.toHaveBeenCalled();
    });

    it('checks manage member permission with expected action and subject', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: '4dd86187-b82f-4a3d-8e85-eecf8d699ad0',
        role: 'reader',
        userIds: ['ce360b2f-3682-4252-a849-1222ddc4454f'],
        groupIds: [],
      };
      const ability = createMockAbility();

      spaceAbilityFactory.createForUser.mockResolvedValue(ability);
      spaceMemberService.addMembersToSpaceBatch.mockResolvedValue([]);

      await controller.addSpaceMember(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Manage,
        SpaceCaslSubject.Member,
      );
    });
  });

  describe('removeSpaceMember', () => {
    it('removes a user member when authorized', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: 'a06c7e7e-2f8f-4873-a7f7-ac5e77bfbcaf',
        userId: 'd72eeb67-f670-4448-8f3c-f27fbcbb2887',
        groupId: '',
      };
      const response = { success: true };

      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceMemberService.removeMemberFromSpace.mockResolvedValue(response);

      await expect(
        controller.removeSpaceMember(dto, user, workspace),
      ).resolves.toEqual(response);
      expect(spaceMemberService.removeMemberFromSpace).toHaveBeenCalledWith(
        dto,
        workspace.id,
      );
    });

    it('removes a group member when authorized', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: '18cb4d02-0b90-4f18-9f50-b0aad8ea4f16',
        userId: '',
        groupId: 'f2de4d00-87d8-4f08-8e78-d6cbcaec55f6',
      };

      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceMemberService.removeMemberFromSpace.mockResolvedValue({ success: true });

      await expect(
        controller.removeSpaceMember(dto, user, workspace),
      ).resolves.toEqual({ success: true });
    });

    it('throws BadRequestException when both userId and groupId are missing', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: '03d2005a-049e-400e-9f87-118cb83e9688',
        userId: '',
        groupId: '',
      };

      await expect(controller.removeSpaceMember(dto, user, workspace)).rejects.toThrow(
        new BadRequestException('userId or groupId is required'),
      );
      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when both userId and groupId are provided', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: '2fc5f092-178d-441f-8451-b2f5ed2cf738',
        userId: '05e18df6-aa5c-4f84-a555-f40e97d71e4e',
        groupId: '660194dc-7c5a-4d76-a81c-b9920f55ca8d',
      };

      await expect(controller.removeSpaceMember(dto, user, workspace)).rejects.toThrow(
        new BadRequestException('please provide either a userId or groupId and both'),
      );
      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when manage member permission is denied', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: 'd221f724-72ff-4efa-8348-f1f947c15035',
        userId: 'cb79fb57-c0df-4ac5-a2af-8449b4d1b70e',
        groupId: '',
      };

      spaceAbilityFactory.createForUser.mockResolvedValue(
        createMockAbility({ can: false }),
      );

      await expect(controller.removeSpaceMember(dto, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
      expect(spaceMemberService.removeMemberFromSpace).not.toHaveBeenCalled();
    });
  });

  describe('updateSpaceMemberRole', () => {
    it('updates a user member role when authorized', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: '1939bb26-fe6e-4581-b8f6-3b01434f7822',
        userId: '8f32f297-fad5-42f0-a87f-e334df74d070',
        groupId: '',
        role: 'admin',
      };
      const response = { success: true };

      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceMemberService.updateSpaceMemberRole.mockResolvedValue(response);

      await expect(
        controller.updateSpaceMemberRole(dto, user, workspace),
      ).resolves.toEqual(response);
      expect(spaceMemberService.updateSpaceMemberRole).toHaveBeenCalledWith(
        dto,
        workspace.id,
      );
    });

    it('updates a group member role when authorized', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: 'fb3871ac-b627-4e1f-b00c-0453b6c0eeb5',
        userId: '',
        groupId: '3a0ffca6-7881-4f3f-b42e-5c39ef955e7f',
        role: 'reader',
      };

      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility());
      spaceMemberService.updateSpaceMemberRole.mockResolvedValue({ success: true });

      await expect(
        controller.updateSpaceMemberRole(dto, user, workspace),
      ).resolves.toEqual({ success: true });
    });

    it('throws BadRequestException when both userId and groupId are missing', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: 'f2a25889-7a0d-47f3-95a0-a474cc8d0d1b',
        userId: '',
        groupId: '',
        role: 'writer',
      };

      await expect(
        controller.updateSpaceMemberRole(dto, user, workspace),
      ).rejects.toThrow(new BadRequestException('userId or groupId is required'));
      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when both userId and groupId are provided', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: '5c027e6f-df5c-4a95-9c84-d390e0c0ec42',
        userId: '84831a63-ad0d-4465-bbd5-11d676f2f162',
        groupId: '8a8e3eaa-8464-47b1-939f-df2fbc9f4f50',
        role: 'writer',
      };

      await expect(
        controller.updateSpaceMemberRole(dto, user, workspace),
      ).rejects.toThrow(
        new BadRequestException('please provide either a userId or groupId and both'),
      );
      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when manage member permission is denied', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        spaceId: 'c4b780b2-6d96-4452-8b91-7258f70d52b2',
        userId: '889d9478-f84a-4d62-9045-3f92df4a543e',
        groupId: '',
        role: 'writer',
      };

      spaceAbilityFactory.createForUser.mockResolvedValue(
        createMockAbility({ can: false }),
      );

      await expect(
        controller.updateSpaceMemberRole(dto, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(spaceMemberService.updateSpaceMemberRole).not.toHaveBeenCalled();
    });
  });
});
