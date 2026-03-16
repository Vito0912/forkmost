import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { AuthProviderRepo } from '../../database/repos/auth-provider/auth-provider.repo';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  createMockUser,
  createMockWorkspace,
} from '../../test-utils/test-helpers';

jest.mock('./user.service', () => ({
  UserService: class UserService {
    update = jest.fn();
  },
}));

describe('UserController', () => {
  let controller: UserController;
  let userService: { update: jest.Mock };
  let workspaceRepo: { getActiveUserCount: jest.Mock };
  let authProviderRepo: { findOidcProvider: jest.Mock };

  beforeEach(async () => {
    userService = {
      update: jest.fn(),
    };

    workspaceRepo = {
      getActiveUserCount: jest.fn().mockResolvedValue(7),
    };

    authProviderRepo = {
      findOidcProvider: jest.fn().mockResolvedValue(null),
    };

    const moduleBuilder = Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: userService,
        },
        {
          provide: WorkspaceRepo,
          useValue: workspaceRepo,
        },
        {
          provide: AuthProviderRepo,
          useValue: authProviderRepo,
        },
      ],
    });

    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: jest.fn().mockReturnValue(true),
    });

    const module: TestingModule = await moduleBuilder.compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserInfo', () => {
    it('returns user info with workspace data including memberCount and hasLicenseKey', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace({ licenseKey: 'license-key-1' });

      const result = await controller.getUserInfo(user, workspace);

      expect(result.workspace.memberCount).toBe(7);
      expect(result.workspace.hasLicenseKey).toBe(true);
      expect(result.workspace.id).toBe(workspace.id);
      expect(result.workspace.name).toBe(workspace.name);
    });

    it('excludes licenseKey from returned workspace data', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace({ licenseKey: 'license-key-1' });

      const result = await controller.getUserInfo(user, workspace);

      expect(result.workspace).not.toHaveProperty('licenseKey');
    });

    it('calls workspaceRepo.getActiveUserCount with workspace id', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();

      await controller.getUserInfo(user, workspace);

      expect(workspaceRepo.getActiveUserCount).toHaveBeenCalledTimes(1);
      expect(workspaceRepo.getActiveUserCount).toHaveBeenCalledWith(
        workspace.id,
      );
    });

    it('calls authProviderRepo.findOidcProvider with workspace id', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();

      await controller.getUserInfo(user, workspace);

      expect(authProviderRepo.findOidcProvider).toHaveBeenCalledTimes(1);
      expect(authProviderRepo.findOidcProvider).toHaveBeenCalledWith(
        workspace.id,
      );
    });

    it('returns isAvatarExternallyManaged as false when no OIDC provider is configured', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();

      const result = await controller.getUserInfo(user, workspace);

      expect(result.user.isAvatarExternallyManaged).toBe(false);
    });

    it('returns isAvatarExternallyManaged as false when OIDC provider has no avatar attribute', async () => {
      authProviderRepo.findOidcProvider.mockResolvedValue({
        id: 'provider-1',
        oidcAvatarAttribute: '',
      });

      const user = createMockUser();
      const workspace = createMockWorkspace();

      const result = await controller.getUserInfo(user, workspace);

      expect(result.user.isAvatarExternallyManaged).toBe(false);
    });

    it('returns isAvatarExternallyManaged as true when OIDC provider has avatar attribute', async () => {
      authProviderRepo.findOidcProvider.mockResolvedValue({
        id: 'provider-1',
        oidcAvatarAttribute: 'picture',
      });

      const user = createMockUser();
      const workspace = createMockWorkspace();

      const result = await controller.getUserInfo(user, workspace);

      expect(result.user.isAvatarExternallyManaged).toBe(true);
    });

    it('returns hasLicenseKey as true when workspace has a license key', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace({ licenseKey: 'license-key-1' });

      const result = await controller.getUserInfo(user, workspace);

      expect(result.workspace.hasLicenseKey).toBe(true);
    });

    it('returns hasLicenseKey as false when workspace does not have a license key', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace({ licenseKey: null });

      const result = await controller.getUserInfo(user, workspace);

      expect(result.workspace.hasLicenseKey).toBe(false);
    });

    it('returns original user fields with isAvatarExternallyManaged', async () => {
      const user = createMockUser({ name: 'Alice' });
      const workspace = createMockWorkspace();

      const result = await controller.getUserInfo(user, workspace);

      expect(result.user.id).toBe(user.id);
      expect(result.user.name).toBe('Alice');
      expect(result.user.email).toBe(user.email);
      expect(result.user.isAvatarExternallyManaged).toBe(false);
    });
  });

  describe('updateUser', () => {
    it('calls userService.update with correct dto, user id, and workspace', async () => {
      const dto = {
        name: 'Updated Name',
        locale: 'de',
      } as UpdateUserDto;
      const user = createMockUser({ id: 'user-id-22' });
      const workspace = createMockWorkspace({ id: 'workspace-id-22' });
      const updatedUser = createMockUser({ name: 'Updated Name' });

      userService.update.mockResolvedValue(updatedUser);

      await controller.updateUser(dto, user, workspace);

      expect(userService.update).toHaveBeenCalledTimes(1);
      expect(userService.update).toHaveBeenCalledWith(dto, user.id, workspace);
    });

    it('returns updated user data', async () => {
      const dto = {
        name: 'Updated Name',
      } as UpdateUserDto;
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const updatedUser = createMockUser({
        name: 'Updated Name',
        locale: 'fr',
      });

      userService.update.mockResolvedValue(updatedUser);

      const result = await controller.updateUser(dto, user, workspace);

      expect(result).toEqual(updatedUser);
    });
  });
});
