import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  createMockAbility,
  createMockUser,
  createMockWorkspace,
  createMockWorkspaceAbilityFactory,
  createPaginationResult,
} from '../../test-utils/test-helpers';
import { ApiKeyController } from './api-key.controller';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import { ApiKeyService } from './api-key.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

function createMockApiKey(overrides: Record<string, any> = {}): any {
  return {
    id: 'api-key-id-1',
    name: 'Test API Key',
    creatorId: 'user-id-1',
    workspaceId: 'workspace-id-1',
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    ...overrides,
  };
}

describe('ApiKeyController', () => {
  let controller: ApiKeyController;

  let apiKeyService: {
    getApiKeys: jest.Mock;
    createApiKey: jest.Mock;
    updateApiKey: jest.Mock;
    revokeApiKey: jest.Mock;
  };
  let workspaceAbilityFactory: {
    createForUser: jest.Mock;
  };

  beforeEach(async () => {
    apiKeyService = {
      getApiKeys: jest.fn(),
      createApiKey: jest.fn(),
      updateApiKey: jest.fn(),
      revokeApiKey: jest.fn(),
    };

    workspaceAbilityFactory = createMockWorkspaceAbilityFactory(
      createMockAbility(),
    ) as {
      createForUser: jest.Mock;
    };

    const moduleBuilder = Test.createTestingModule({
      controllers: [ApiKeyController],
      providers: [
        {
          provide: ApiKeyService,
          useValue: apiKeyService,
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

    controller = module.get<ApiKeyController>(ApiKeyController);
  });

  describe('controller definition', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('POST /api-keys/', () => {
    it('returns paginated API keys for authorized user', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const pagination = { limit: 10, cursor: null, query: '', adminView: false };
      const apiKey1 = createMockApiKey();
      const apiKey2 = createMockApiKey({ id: 'api-key-id-2', name: 'Second API Key' });
      const result = createPaginationResult([apiKey1, apiKey2]);

      apiKeyService.getApiKeys.mockResolvedValue(result);

      await expect(controller.getApiKeys(pagination, user, workspace)).resolves.toEqual(
        result,
      );
      expect(apiKeyService.getApiKeys).toHaveBeenCalledWith(workspace.id, pagination);
    });

    it('throws ForbiddenException when create permission is denied', () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const pagination = { limit: 10, cursor: null, query: '', adminView: false };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() => controller.getApiKeys(pagination, user, workspace)).toThrow(
        ForbiddenException,
      );
      expect(apiKeyService.getApiKeys).not.toHaveBeenCalled();
    });

    it('checks Create API permission with expected action and subject', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const pagination = { limit: 20, cursor: null, query: '', adminView: false };
      const ability = createMockAbility();

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      apiKeyService.getApiKeys.mockResolvedValue(createPaginationResult([]));

      await controller.getApiKeys(pagination, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Create,
        WorkspaceCaslSubject.API,
      );
    });

    it('returns empty list when no API keys exist', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const pagination = { limit: 10, cursor: null, query: '', adminView: false };
      const result = createPaginationResult([]);

      apiKeyService.getApiKeys.mockResolvedValue(result);

      await expect(controller.getApiKeys(pagination, user, workspace)).resolves.toEqual(
        result,
      );
    });

    it('getApiKeys with custom pagination cursor', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const pagination = {
        limit: 25,
        cursor: 'api-key-cursor-123',
        query: '',
        adminView: false,
      };
      const result = createPaginationResult([createMockApiKey()]);

      apiKeyService.getApiKeys.mockResolvedValue(result);

      await expect(controller.getApiKeys(pagination, user, workspace)).resolves.toEqual(
        result,
      );
      expect(apiKeyService.getApiKeys).toHaveBeenCalledWith(workspace.id, pagination);
    });

    it('creates ability using current user and workspace for listing', async () => {
      const user = createMockUser({ id: 'user-id-list-1' });
      const workspace = createMockWorkspace({ id: 'workspace-id-list-1' });
      const pagination = { limit: 10, cursor: null, query: '', adminView: false };

      apiKeyService.getApiKeys.mockResolvedValue(createPaginationResult([]));

      await controller.getApiKeys(pagination, user, workspace);

      expect(workspaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, workspace);
    });
  });

  describe('POST /api-keys/create', () => {
    it('creates API key for authorized user', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { name: 'CI/CD Pipeline' };
      const result = {
        ...createMockApiKey({ name: dto.name }),
        token: 'jwt-token-here',
      };

      apiKeyService.createApiKey.mockResolvedValue(result);

      await expect(controller.createApiKey(dto, user, workspace)).resolves.toEqual(result);
      expect(apiKeyService.createApiKey).toHaveBeenCalledWith(user, workspace.id, dto);
    });

    it('creates API key with expiration date', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        name: 'Temporary Key',
        expiresAt: '2026-12-31T23:59:59Z',
      };
      const result = {
        ...createMockApiKey({ name: dto.name, expiresAt: dto.expiresAt }),
        token: 'temporary-token',
      };

      apiKeyService.createApiKey.mockResolvedValue(result);

      await expect(controller.createApiKey(dto, user, workspace)).resolves.toEqual(result);
      expect(apiKeyService.createApiKey).toHaveBeenCalledWith(user, workspace.id, dto);
    });

    it('throws ForbiddenException when create permission is denied', () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { name: 'Denied Key' };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() => controller.createApiKey(dto, user, workspace)).toThrow(
        ForbiddenException,
      );
      expect(apiKeyService.createApiKey).not.toHaveBeenCalled();
    });

    it('checks Create API permission before creating key', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { name: 'Permission Check Key' };
      const ability = createMockAbility();
      const result = {
        ...createMockApiKey({ name: dto.name }),
        token: 'permission-check-token',
      };

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      apiKeyService.createApiKey.mockResolvedValue(result);

      await controller.createApiKey(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Create,
        WorkspaceCaslSubject.API,
      );
    });

    it('returns created API key with token', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { name: 'Token Key' };
      const result = {
        ...createMockApiKey({ id: 'api-key-id-token', name: dto.name }),
        token: 'returned-token-value',
      };

      apiKeyService.createApiKey.mockResolvedValue(result);

      await expect(controller.createApiKey(dto, user, workspace)).resolves.toEqual(result);
      expect(result.token).toBe('returned-token-value');
    });

    it('createApiKey passes user object to service', async () => {
      const user = createMockUser({ id: 'user-id-service-pass' });
      const workspace = createMockWorkspace();
      const dto = { name: 'User Pass Through Key' };
      const result = {
        ...createMockApiKey({ name: dto.name }),
        token: 'user-pass-token',
      };

      apiKeyService.createApiKey.mockResolvedValue(result);

      await controller.createApiKey(dto, user, workspace);

      expect(apiKeyService.createApiKey).toHaveBeenCalledWith(user, workspace.id, dto);
      expect(apiKeyService.createApiKey.mock.calls[0][0]).toEqual(user);
    });
  });

  describe('POST /api-keys/update', () => {
    it('updates API key name for authorized user', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        apiKeyId: 'cae809b7-c041-4f9a-b58c-a5da8dbf47b9',
        name: 'Renamed Key',
      };
      const result = createMockApiKey({ id: dto.apiKeyId, name: dto.name });

      apiKeyService.updateApiKey.mockResolvedValue(result);

      await expect(controller.updateApiKey(dto, user, workspace)).resolves.toEqual(result);
      expect(apiKeyService.updateApiKey).toHaveBeenCalledWith(workspace.id, dto);
    });

    it('throws ForbiddenException when manage permission is denied', () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        apiKeyId: '0da4930f-4757-4b3f-9821-fca15f89f1d9',
        name: 'Forbidden Rename',
      };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() => controller.updateApiKey(dto, user, workspace)).toThrow(
        ForbiddenException,
      );
      expect(apiKeyService.updateApiKey).not.toHaveBeenCalled();
    });

    it('checks Manage API permission before updating key', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        apiKeyId: '460db6ab-c3ff-48f5-b415-bc8de0904197',
        name: 'Manage Check Name',
      };
      const ability = createMockAbility();

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      apiKeyService.updateApiKey.mockResolvedValue(
        createMockApiKey({ id: dto.apiKeyId, name: dto.name }),
      );

      await controller.updateApiKey(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.API,
      );
    });

    it('passes correct workspace ID and DTO to service', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace({ id: 'workspace-id-update-1' });
      const dto = {
        apiKeyId: '85395f7d-30a0-4f8f-9943-4c438b82e8e5',
        name: 'Workspace Forwarding Name',
      };
      const result = createMockApiKey({ id: dto.apiKeyId, name: dto.name });

      apiKeyService.updateApiKey.mockResolvedValue(result);

      await expect(controller.updateApiKey(dto, user, workspace)).resolves.toEqual(result);
      expect(apiKeyService.updateApiKey).toHaveBeenCalledTimes(1);
      expect(apiKeyService.updateApiKey).toHaveBeenCalledWith(workspace.id, dto);
    });

    it('returns updated api key payload', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        apiKeyId: '5b2f3356-090f-4112-852b-7f00dca2d2a2',
        name: 'Updated Name Visible',
      };
      const result = createMockApiKey({ id: dto.apiKeyId, name: dto.name });

      apiKeyService.updateApiKey.mockResolvedValue(result);

      await expect(controller.updateApiKey(dto, user, workspace)).resolves.toEqual(result);
      expect(result.name).toBe(dto.name);
    });

    it('creates ability using current user and workspace for update', async () => {
      const user = createMockUser({ id: 'user-id-update-ability' });
      const workspace = createMockWorkspace({ id: 'workspace-id-update-ability' });
      const dto = {
        apiKeyId: 'c968a6b9-ea67-44a1-b409-2f62d8b36f7b',
        name: 'Ability Factory Update Name',
      };

      apiKeyService.updateApiKey.mockResolvedValue(
        createMockApiKey({ id: dto.apiKeyId, name: dto.name }),
      );

      await controller.updateApiKey(dto, user, workspace);

      expect(workspaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, workspace);
    });
  });

  describe('POST /api-keys/revoke', () => {
    it('revokes API key for authorized user', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { apiKeyId: '700dc123-63d8-4895-bfe2-c75d9f601fe6' };

      apiKeyService.revokeApiKey.mockResolvedValue(undefined);

      await expect(controller.revokeApiKey(dto, user, workspace)).resolves.toBeUndefined();
      expect(apiKeyService.revokeApiKey).toHaveBeenCalledWith(workspace.id, dto.apiKeyId);
    });

    it('throws ForbiddenException when manage permission is denied', () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { apiKeyId: '89e07e04-225f-4f35-a90a-cef5d4ef11c7' };

      workspaceAbilityFactory.createForUser.mockReturnValue(
        createMockAbility({ can: false }),
      );

      expect(() => controller.revokeApiKey(dto, user, workspace)).toThrow(
        ForbiddenException,
      );
      expect(apiKeyService.revokeApiKey).not.toHaveBeenCalled();
    });

    it('checks Manage API permission before revoking key', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = { apiKeyId: 'bce3bdf2-d35b-4bc0-9608-5297355f02c1' };
      const ability = createMockAbility();

      workspaceAbilityFactory.createForUser.mockReturnValue(ability);
      apiKeyService.revokeApiKey.mockResolvedValue(undefined);

      await controller.revokeApiKey(dto, user, workspace);

      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.API,
      );
    });

    it('passes correct workspace ID and api key ID to service', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace({ id: 'workspace-id-revoke-1' });
      const dto = { apiKeyId: '8f4f2add-268f-4ca6-8da5-ab72aede2785' };

      apiKeyService.revokeApiKey.mockResolvedValue(undefined);

      await expect(controller.revokeApiKey(dto, user, workspace)).resolves.toBeUndefined();
      expect(apiKeyService.revokeApiKey).toHaveBeenCalledWith(workspace.id, dto.apiKeyId);
    });

    it('revokeApiKey extracts apiKeyId from DTO', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const dto = {
        apiKeyId: '3f3f3e6b-ed66-4703-b01e-275c0aabdebe',
      };

      apiKeyService.revokeApiKey.mockResolvedValue(undefined);

      await controller.revokeApiKey(dto, user, workspace);

      expect(apiKeyService.revokeApiKey).toHaveBeenCalledWith(workspace.id, dto.apiKeyId);
      expect(apiKeyService.revokeApiKey).not.toHaveBeenCalledWith(workspace.id, dto);
    });

    it('creates ability using current user and workspace for revoke', async () => {
      const user = createMockUser({ id: 'user-id-revoke-ability' });
      const workspace = createMockWorkspace({ id: 'workspace-id-revoke-ability' });
      const dto = {
        apiKeyId: 'fbe2eb7e-0707-4a85-a412-4f4f59c41300',
      };

      apiKeyService.revokeApiKey.mockResolvedValue(undefined);

      await controller.revokeApiKey(dto, user, workspace);

      expect(workspaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, workspace);
    });
  });

  describe('ability checks across users', () => {
    it('different users get different ability checks', async () => {
      const userOne = createMockUser({ id: 'user-id-ability-1', role: 'member' });
      const userTwo = createMockUser({ id: 'user-id-ability-2', role: 'admin' });
      const workspace = createMockWorkspace();
      const userOneAbility = createMockAbility({ can: false });
      const userTwoAbility = createMockAbility({ can: true });
      const dto = { name: 'Admin Allowed Key' };
      const result = {
        ...createMockApiKey({ name: dto.name }),
        token: 'admin-key-token',
      };

      workspaceAbilityFactory.createForUser
        .mockReturnValueOnce(userOneAbility)
        .mockReturnValueOnce(userTwoAbility);
      apiKeyService.createApiKey.mockResolvedValue(result);

      expect(() => controller.createApiKey(dto, userOne, workspace)).toThrow(
        ForbiddenException,
      );
      await expect(controller.createApiKey(dto, userTwo, workspace)).resolves.toEqual(
        result,
      );
      expect(workspaceAbilityFactory.createForUser).toHaveBeenNthCalledWith(
        1,
        userOne,
        workspace,
      );
      expect(workspaceAbilityFactory.createForUser).toHaveBeenNthCalledWith(
        2,
        userTwo,
        workspace,
      );
    });
  });
});
