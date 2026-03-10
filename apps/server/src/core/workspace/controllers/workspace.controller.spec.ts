import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { ChangeWorkspaceMemberPasswordDto } from '../../auth/dto/change-password.dto';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../casl/interfaces/workspace-ability.type';
import { CheckHostnameDto } from '../dto/check-hostname.dto';
import {
  AcceptInviteDto,
  InvitationIdDto,
  InviteUserDto,
  RevokeInviteDto,
} from '../dto/invitation.dto';
import { RemoveWorkspaceUserDto } from '../dto/remove-workspace-user.dto';
import { UpdateWorkspaceUserRoleDto } from '../dto/update-workspace-user-role.dto';
import { UpdateWorkspaceDto } from '../dto/update-workspace.dto';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceInvitationService } from '../services/workspace-invitation.service';
import { WorkspaceService } from '../services/workspace.service';
import WorkspaceAbilityFactory from '../../casl/abilities/workspace-ability.factory';
import {
  createMockAbility,
  createMockFastifyReply,
  createMockInvitation,
  createMockUser,
  createMockWorkspace,
  createMockWorkspaceAbilityFactory,
  createPaginationResult,
} from '../../../test-utils/test-helpers';

jest.mock('../services/workspace.service', () => ({
  WorkspaceService: class WorkspaceService {},
}));

jest.mock('../services/workspace-invitation.service', () => ({
  WorkspaceInvitationService: class WorkspaceInvitationService {},
}));

describe('WorkspaceController', () => {
  let controller: WorkspaceController;

  let workspaceService: any;
  let workspaceInvitationService: any;
  let workspaceAbilityFactory: any;
  let environmentService: any;
  let ability: any;

  const user = createMockUser();
  const workspace = createMockWorkspace();

  beforeEach(async () => {
    ability = createMockAbility({ can: true });
    workspaceAbilityFactory = createMockWorkspaceAbilityFactory(ability);

    workspaceService = {
      getWorkspacePublicData: jest.fn(),
      getWorkspaceInfo: jest.fn(),
      update: jest.fn(),
      getWorkspaceUsers: jest.fn(),
      deactivateUser: jest.fn(),
      activateUser: jest.fn(),
      changeUserPassword: jest.fn(),
      deleteUser: jest.fn(),
      updateWorkspaceUserRole: jest.fn(),
      checkHostname: jest.fn(),
    };

    workspaceInvitationService = {
      getInvitations: jest.fn(),
      getInvitationById: jest.fn(),
      createInvitation: jest.fn(),
      resendInvitation: jest.fn(),
      revokeInvitation: jest.fn(),
      acceptInvitation: jest.fn(),
      getInvitationLinkById: jest.fn(),
    };

    environmentService = {
      getCookieExpiresIn: jest.fn().mockReturnValue(new Date('2026-01-01T00:00:00.000Z')),
      isHttps: jest.fn().mockReturnValue(true),
      isCloud: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkspaceController],
      providers: [
        { provide: WorkspaceService, useValue: workspaceService },
        {
          provide: WorkspaceInvitationService,
          useValue: workspaceInvitationService,
        },
        { provide: WorkspaceAbilityFactory, useValue: workspaceAbilityFactory },
        { provide: EnvironmentService, useValue: environmentService },
      ],
    }).compile();

    controller = module.get<WorkspaceController>(WorkspaceController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('marks getWorkspacePublicInfo as public', () => {
    const metadata = Reflect.getMetadata(
      IS_PUBLIC_KEY,
      controller.getWorkspacePublicInfo,
    );

    expect(metadata).toBe(true);
  });

  it('marks getInvitationById as public', () => {
    const metadata = Reflect.getMetadata(
      IS_PUBLIC_KEY,
      controller.getInvitationById,
    );

    expect(metadata).toBe(true);
  });

  it('marks acceptInvite as public', () => {
    const metadata = Reflect.getMetadata(IS_PUBLIC_KEY, controller.acceptInvite);

    expect(metadata).toBe(true);
  });

  it('marks checkHostname as public', () => {
    const metadata = Reflect.getMetadata(IS_PUBLIC_KEY, controller.checkHostname);

    expect(metadata).toBe(true);
  });

  describe('getWorkspacePublicInfo', () => {
    it('returns public workspace info by request raw workspaceId', async () => {
      const req = { raw: { workspaceId: 'workspace-id-public' } };
      const publicData = {
        id: 'workspace-id-public',
        name: 'Public Workspace',
      };
      workspaceService.getWorkspacePublicData.mockResolvedValue(publicData);

      const result = await controller.getWorkspacePublicInfo(req);

      expect(workspaceService.getWorkspacePublicData).toHaveBeenCalledWith(
        'workspace-id-public',
      );
      expect(result).toEqual(publicData);
    });

    it('propagates workspace service errors', async () => {
      const req = { raw: { workspaceId: 'workspace-id-public' } };
      const error = new Error('failed');
      workspaceService.getWorkspacePublicData.mockRejectedValue(error);

      await expect(controller.getWorkspacePublicInfo(req)).rejects.toThrow(error);
    });
  });

  describe('getWorkspace', () => {
    it('returns workspace info', async () => {
      const workspaceInfo = { id: workspace.id, name: workspace.name };
      workspaceService.getWorkspaceInfo.mockResolvedValue(workspaceInfo);

      const result = await controller.getWorkspace(workspace);

      expect(workspaceService.getWorkspaceInfo).toHaveBeenCalledWith(workspace.id);
      expect(result).toEqual(workspaceInfo);
    });
  });

  describe('updateWorkspace', () => {
    it('updates workspace when user can manage settings', async () => {
      const dto = { name: 'Updated' } as UpdateWorkspaceDto;
      const updatedWorkspace = createMockWorkspace({ name: 'Updated' });
      const res = createMockFastifyReply();
      ability.cannot.mockReturnValue(false);
      workspaceService.update.mockResolvedValue(updatedWorkspace);

      const result = await controller.updateWorkspace(res, dto, user, workspace);

      expect(workspaceAbilityFactory.createForUser).toHaveBeenCalledWith(
        user,
        workspace,
      );
      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Settings,
      );
      expect(workspaceService.update).toHaveBeenCalledWith(workspace.id, dto);
      expect(result).toEqual(updatedWorkspace);
    });

    it('throws forbidden when user cannot manage settings', async () => {
      const dto = { name: 'Updated' } as UpdateWorkspaceDto;
      const res = createMockFastifyReply();
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.updateWorkspace(res, dto, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(workspaceService.update).not.toHaveBeenCalled();
    });

    it('clears authToken cookie when hostname changes and persists', async () => {
      const dto = { hostname: 'new-host' } as UpdateWorkspaceDto;
      const res = createMockFastifyReply();
      const oldWorkspace = createMockWorkspace({ hostname: 'old-host' });
      const updatedWorkspace = createMockWorkspace({ hostname: 'new-host' });
      ability.cannot.mockReturnValue(false);
      workspaceService.update.mockResolvedValue(updatedWorkspace);

      await controller.updateWorkspace(res, dto, user, oldWorkspace);

      expect(res.clearCookie).toHaveBeenCalledWith('authToken');
    });

    it('does not clear cookie when hostname remains the same', async () => {
      const dto = { hostname: 'same-host' } as UpdateWorkspaceDto;
      const res = createMockFastifyReply();
      const currentWorkspace = createMockWorkspace({ hostname: 'same-host' });
      const updatedWorkspace = createMockWorkspace({ hostname: 'same-host' });
      ability.cannot.mockReturnValue(false);
      workspaceService.update.mockResolvedValue(updatedWorkspace);

      await controller.updateWorkspace(res, dto, user, currentWorkspace);

      expect(res.clearCookie).not.toHaveBeenCalled();
    });

    it('does not clear cookie when dto hostname is missing', async () => {
      const dto = { name: 'Renamed Workspace' } as UpdateWorkspaceDto;
      const res = createMockFastifyReply();
      const updatedWorkspace = createMockWorkspace({ hostname: 'new-host' });
      ability.cannot.mockReturnValue(false);
      workspaceService.update.mockResolvedValue(updatedWorkspace);

      await controller.updateWorkspace(res, dto, user, workspace);

      expect(res.clearCookie).not.toHaveBeenCalled();
    });
  });

  describe('getWorkspaceMembers', () => {
    it('returns paginated workspace members when allowed', async () => {
      const pagination = { limit: 20, query: '', adminView: false };
      const members = createPaginationResult([createMockUser({ id: 'user-2' })], {
        limit: 20,
        hasNextPage: true,
        nextCursor: 'next-1',
      });
      ability.cannot.mockReturnValue(false);
      workspaceService.getWorkspaceUsers.mockResolvedValue(members);

      const result = await controller.getWorkspaceMembers(
        pagination,
        user,
        workspace,
      );

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Read,
        WorkspaceCaslSubject.Member,
      );
      expect(workspaceService.getWorkspaceUsers).toHaveBeenCalledWith(
        user,
        workspace.id,
        pagination,
      );
      expect(result).toEqual(members);
    });

    it('throws forbidden when user cannot read members', async () => {
      const pagination = { limit: 20, query: '', adminView: false };
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.getWorkspaceMembers(pagination, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(workspaceService.getWorkspaceUsers).not.toHaveBeenCalled();
    });

    it('returns current user when first page is empty', async () => {
      const pagination = { limit: 10, query: '', adminView: false };
      const members = createPaginationResult([], { limit: 10 });
      ability.cannot.mockReturnValue(false);
      workspaceService.getWorkspaceUsers.mockResolvedValue(members);

      const result = await controller.getWorkspaceMembers(
        pagination,
        user,
        workspace,
      );

      expect(result).toEqual({
        items: [user],
        meta: {
          limit: 10,
          hasNextPage: false,
          hasPrevPage: false,
          nextCursor: null,
          prevCursor: null,
        },
      });
    });

    it('returns original empty result when cursor is present', async () => {
      const pagination = {
        limit: 10,
        query: '',
        adminView: false,
        cursor: 'cursor-1',
      };
      const members = createPaginationResult([], { limit: 10 });
      ability.cannot.mockReturnValue(false);
      workspaceService.getWorkspaceUsers.mockResolvedValue(members);

      const result = await controller.getWorkspaceMembers(
        pagination,
        user,
        workspace,
      );

      expect(result).toEqual(members);
    });

    it('returns original empty result when beforeCursor is present', async () => {
      const pagination = {
        limit: 10,
        query: '',
        adminView: false,
        beforeCursor: 'before-1',
      };
      const members = createPaginationResult([], { limit: 10 });
      ability.cannot.mockReturnValue(false);
      workspaceService.getWorkspaceUsers.mockResolvedValue(members);

      const result = await controller.getWorkspaceMembers(
        pagination,
        user,
        workspace,
      );

      expect(result).toEqual(members);
    });
  });

  describe('deactivateWorkspaceMember', () => {
    it('deactivates a workspace member when permitted', async () => {
      const dto = { userId: 'target-user-id' } as RemoveWorkspaceUserDto;
      ability.cannot.mockReturnValue(false);

      await controller.deactivateWorkspaceMember(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Member,
      );
      expect(workspaceService.deactivateUser).toHaveBeenCalledWith(
        user,
        dto.userId,
        workspace.id,
      );
    });

    it('throws forbidden when deactivating without permission', async () => {
      const dto = { userId: 'target-user-id' } as RemoveWorkspaceUserDto;
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.deactivateWorkspaceMember(dto, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(workspaceService.deactivateUser).not.toHaveBeenCalled();
    });
  });

  describe('activateWorkspaceMember', () => {
    it('activates a workspace member when permitted', async () => {
      const dto = { userId: 'target-user-id' } as RemoveWorkspaceUserDto;
      ability.cannot.mockReturnValue(false);

      await controller.activateWorkspaceMember(dto, user, workspace);

      expect(workspaceService.activateUser).toHaveBeenCalledWith(
        user,
        dto.userId,
        workspace.id,
      );
    });

    it('throws forbidden when activating without permission', async () => {
      const dto = { userId: 'target-user-id' } as RemoveWorkspaceUserDto;
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.activateWorkspaceMember(dto, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(workspaceService.activateUser).not.toHaveBeenCalled();
    });
  });

  describe('changePasswordForWorkspaceMember', () => {
    it('changes member password when permitted', async () => {
      const dto = {
        actorPassword: 'actor-password',
        newPassword: 'new-password',
        userId: 'target-user-id',
      } as ChangeWorkspaceMemberPasswordDto;
      ability.cannot.mockReturnValue(false);

      await controller.changePasswordForWorkspaceMember(dto, user, workspace);

      expect(workspaceService.changeUserPassword).toHaveBeenCalledWith(
        dto,
        user.id,
        workspace.id,
      );
    });

    it('throws forbidden when changing password without permission', async () => {
      const dto = {
        actorPassword: 'actor-password',
        newPassword: 'new-password',
        userId: 'target-user-id',
      } as ChangeWorkspaceMemberPasswordDto;
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.changePasswordForWorkspaceMember(dto, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(workspaceService.changeUserPassword).not.toHaveBeenCalled();
    });
  });

  describe('deleteWorkspaceMember', () => {
    it('deletes workspace member when permitted', async () => {
      const dto = { userId: 'target-user-id' } as RemoveWorkspaceUserDto;
      ability.cannot.mockReturnValue(false);

      await controller.deleteWorkspaceMember(dto, user, workspace);

      expect(workspaceService.deleteUser).toHaveBeenCalledWith(
        user,
        dto.userId,
        workspace.id,
      );
    });

    it('throws forbidden when deleting member without permission', async () => {
      const dto = { userId: 'target-user-id' } as RemoveWorkspaceUserDto;
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.deleteWorkspaceMember(dto, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(workspaceService.deleteUser).not.toHaveBeenCalled();
    });
  });

  describe('updateWorkspaceMemberRole', () => {
    it('updates workspace member role when permitted', async () => {
      const dto = {
        userId: 'target-user-id',
        role: 'admin',
      } as UpdateWorkspaceUserRoleDto;
      const updated = createMockUser({ id: dto.userId, role: dto.role });
      ability.cannot.mockReturnValue(false);
      workspaceService.updateWorkspaceUserRole.mockResolvedValue(updated);

      const result = await controller.updateWorkspaceMemberRole(
        dto,
        user,
        workspace,
      );

      expect(workspaceService.updateWorkspaceUserRole).toHaveBeenCalledWith(
        user,
        dto,
        workspace.id,
      );
      expect(result).toEqual(updated);
    });

    it('throws forbidden when changing role without permission', async () => {
      const dto = {
        userId: 'target-user-id',
        role: 'admin',
      } as UpdateWorkspaceUserRoleDto;
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.updateWorkspaceMemberRole(dto, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(workspaceService.updateWorkspaceUserRole).not.toHaveBeenCalled();
    });
  });

  describe('getInvitations', () => {
    it('returns invitations list when permitted', async () => {
      const pagination = { limit: 25, query: '', adminView: false };
      const invitation = createMockInvitation();
      const resultData = createPaginationResult([invitation], { limit: 25 });
      ability.cannot.mockReturnValue(false);
      workspaceInvitationService.getInvitations.mockResolvedValue(resultData);

      const result = await controller.getInvitations(user, workspace, pagination);

      expect(workspaceInvitationService.getInvitations).toHaveBeenCalledWith(
        workspace.id,
        pagination,
      );
      expect(result).toEqual(resultData);
    });

    it('throws forbidden when listing invitations without permission', async () => {
      const pagination = { limit: 25, query: '', adminView: false };
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.getInvitations(user, workspace, pagination),
      ).rejects.toThrow(ForbiddenException);
      expect(workspaceInvitationService.getInvitations).not.toHaveBeenCalled();
    });
  });

  describe('getInvitationById', () => {
    it('returns invitation info', async () => {
      const dto = { invitationId: 'invitation-id-1' } as InvitationIdDto;
      const invitation = createMockInvitation({ id: dto.invitationId });
      workspaceInvitationService.getInvitationById.mockResolvedValue(invitation);

      const result = await controller.getInvitationById(dto, workspace);

      expect(workspaceInvitationService.getInvitationById).toHaveBeenCalledWith(
        dto.invitationId,
        workspace,
      );
      expect(result).toEqual(invitation);
    });

    it('does not create workspace ability for public invite info endpoint', async () => {
      const dto = { invitationId: 'invitation-id-1' } as InvitationIdDto;
      workspaceInvitationService.getInvitationById.mockResolvedValue(
        createMockInvitation(),
      );

      await controller.getInvitationById(dto, workspace);

      expect(workspaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });
  });

  describe('inviteUser', () => {
    it('creates invitations when permitted', async () => {
      const dto = {
        emails: ['invitee@example.com'],
        groupIds: [],
        role: 'member',
      } as InviteUserDto;
      const created = [createMockInvitation({ email: 'invitee@example.com' })];
      ability.cannot.mockReturnValue(false);
      workspaceInvitationService.createInvitation.mockResolvedValue(created);

      const result = await controller.inviteUser(dto, user, workspace);

      expect(workspaceInvitationService.createInvitation).toHaveBeenCalledWith(
        dto,
        workspace,
        user,
      );
      expect(result).toEqual(created);
    });

    it('throws forbidden when creating invites without permission', async () => {
      const dto = {
        emails: ['invitee@example.com'],
        groupIds: [],
        role: 'member',
      } as InviteUserDto;
      ability.cannot.mockReturnValue(true);

      await expect(controller.inviteUser(dto, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
      expect(workspaceInvitationService.createInvitation).not.toHaveBeenCalled();
    });
  });

  describe('resendInvite', () => {
    it('resends invitation when permitted', async () => {
      const dto = { invitationId: 'invitation-id-1' } as RevokeInviteDto;
      const resent = createMockInvitation({ id: dto.invitationId });
      ability.cannot.mockReturnValue(false);
      workspaceInvitationService.resendInvitation.mockResolvedValue(resent);

      const result = await controller.resendInvite(dto, user, workspace);

      expect(workspaceInvitationService.resendInvitation).toHaveBeenCalledWith(
        dto.invitationId,
        workspace,
      );
      expect(result).toEqual(resent);
    });

    it('throws forbidden when resending invites without permission', async () => {
      const dto = { invitationId: 'invitation-id-1' } as RevokeInviteDto;
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.resendInvite(dto, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(workspaceInvitationService.resendInvitation).not.toHaveBeenCalled();
    });
  });

  describe('revokeInvite', () => {
    it('revokes invitation when permitted', async () => {
      const dto = { invitationId: 'invitation-id-1' } as RevokeInviteDto;
      const revoked = { success: true };
      ability.cannot.mockReturnValue(false);
      workspaceInvitationService.revokeInvitation.mockResolvedValue(revoked);

      const result = await controller.revokeInvite(dto, user, workspace);

      expect(workspaceInvitationService.revokeInvitation).toHaveBeenCalledWith(
        dto.invitationId,
        workspace.id,
      );
      expect(result).toEqual(revoked);
    });

    it('throws forbidden when revoking invites without permission', async () => {
      const dto = { invitationId: 'invitation-id-1' } as RevokeInviteDto;
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.revokeInvite(dto, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(workspaceInvitationService.revokeInvitation).not.toHaveBeenCalled();
    });
  });

  describe('acceptInvite', () => {
    it('returns requiresLogin=true when invitation acceptance requires login', async () => {
      const dto = {
        invitationId: 'invitation-id-1',
        name: 'Invitee',
        password: 'password-123',
        token: 'token-1',
      } as AcceptInviteDto;
      const res = createMockFastifyReply();
      workspaceInvitationService.acceptInvitation.mockResolvedValue({
        requiresLogin: true,
      });

      const result = await controller.acceptInvite(dto, workspace, res);

      expect(workspaceInvitationService.acceptInvitation).toHaveBeenCalledWith(
        dto,
        workspace,
      );
      expect(res.setCookie).not.toHaveBeenCalled();
      expect(result).toEqual({ requiresLogin: true });
    });

    it('sets auth cookie and returns requiresLogin=false', async () => {
      const dto = {
        invitationId: 'invitation-id-1',
        name: 'Invitee',
        password: 'password-123',
        token: 'token-1',
      } as AcceptInviteDto;
      const res = createMockFastifyReply();
      const expires = new Date('2027-01-01T00:00:00.000Z');
      environmentService.getCookieExpiresIn.mockReturnValue(expires);
      environmentService.isHttps.mockReturnValue(false);
      workspaceInvitationService.acceptInvitation.mockResolvedValue({
        requiresLogin: false,
        authToken: 'auth-token-1',
      });

      const result = await controller.acceptInvite(dto, workspace, res);

      expect(environmentService.getCookieExpiresIn).toHaveBeenCalledTimes(1);
      expect(environmentService.isHttps).toHaveBeenCalledTimes(1);
      expect(res.setCookie).toHaveBeenCalledWith('authToken', 'auth-token-1', {
        httpOnly: true,
        path: '/',
        expires,
        secure: false,
      });
      expect(result).toEqual({ requiresLogin: false });
    });

    it('does not create workspace ability for public accept invite endpoint', async () => {
      const dto = {
        invitationId: 'invitation-id-1',
        name: 'Invitee',
        password: 'password-123',
        token: 'token-1',
      } as AcceptInviteDto;
      const res = createMockFastifyReply();
      workspaceInvitationService.acceptInvitation.mockResolvedValue({
        requiresLogin: true,
      });

      await controller.acceptInvite(dto, workspace, res);

      expect(workspaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });
  });

  describe('checkHostname', () => {
    it('returns hostname availability result', async () => {
      const dto = { hostname: 'test-host' } as CheckHostnameDto;
      const hostnameResult = { available: true };
      workspaceService.checkHostname.mockResolvedValue(hostnameResult);

      const result = await controller.checkHostname(dto);

      expect(workspaceService.checkHostname).toHaveBeenCalledWith(dto.hostname);
      expect(result).toEqual(hostnameResult);
    });

    it('does not create workspace ability for public check-hostname endpoint', async () => {
      const dto = { hostname: 'test-host' } as CheckHostnameDto;
      workspaceService.checkHostname.mockResolvedValue({ available: true });

      await controller.checkHostname(dto);

      expect(workspaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });
  });

  describe('getInviteLink', () => {
    it('returns invite link when self-hosted and permitted', async () => {
      const dto = { invitationId: 'invitation-id-1' } as InvitationIdDto;
      ability.cannot.mockReturnValue(false);
      environmentService.isCloud.mockReturnValue(false);
      workspaceInvitationService.getInvitationLinkById.mockResolvedValue(
        'https://example.com/invite',
      );

      const result = await controller.getInviteLink(dto, user, workspace);

      expect(environmentService.isCloud).toHaveBeenCalledTimes(1);
      expect(workspaceAbilityFactory.createForUser).toHaveBeenCalledWith(
        user,
        workspace,
      );
      expect(workspaceInvitationService.getInvitationLinkById).toHaveBeenCalledWith(
        dto.invitationId,
        workspace,
      );
      expect(result).toEqual({ inviteLink: 'https://example.com/invite' });
    });

    it('throws forbidden in cloud environment', async () => {
      const dto = { invitationId: 'invitation-id-1' } as InvitationIdDto;
      environmentService.isCloud.mockReturnValue(true);

      await expect(controller.getInviteLink(dto, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
      expect(workspaceAbilityFactory.createForUser).not.toHaveBeenCalled();
      expect(
        workspaceInvitationService.getInvitationLinkById,
      ).not.toHaveBeenCalled();
    });

    it('throws forbidden when permission check fails', async () => {
      const dto = { invitationId: 'invitation-id-1' } as InvitationIdDto;
      environmentService.isCloud.mockReturnValue(false);
      ability.cannot.mockReturnValue(true);

      await expect(controller.getInviteLink(dto, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
      expect(
        workspaceInvitationService.getInvitationLinkById,
      ).not.toHaveBeenCalled();
    });

    it('checks manage member ability when not cloud', async () => {
      const dto = { invitationId: 'invitation-id-1' } as InvitationIdDto;
      environmentService.isCloud.mockReturnValue(false);
      ability.cannot.mockReturnValue(false);
      workspaceInvitationService.getInvitationLinkById.mockResolvedValue(
        'https://example.com/invite',
      );

      await controller.getInviteLink(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Member,
      );
    });
  });
});
