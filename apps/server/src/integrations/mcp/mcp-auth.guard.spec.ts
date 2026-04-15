import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ModuleRef } from '@nestjs/core';
import { McpAuthGuard } from './mcp-auth.guard';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../environment/environment.service';

describe('McpAuthGuard', () => {
  let guard: McpAuthGuard;
  let jwtService: { verifyAsync: jest.Mock };
  let environmentService: { getAppSecret: jest.Mock };
  let userRepo: { findById: jest.Mock };
  let workspaceRepo: { findById: jest.Mock };
  let moduleRef: { get: jest.Mock };

  const mockUser = {
    id: 'user-id-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'admin',
    deactivatedAt: null,
    deletedAt: null,
  };

  const mockWorkspace = {
    id: 'workspace-id-1',
    name: 'Test Workspace',
    settings: { ai: { mcp: true } },
  };

  function createMockContext(headers: Record<string, string> = {}): ExecutionContext {
    const request: any = {
      headers: { authorization: 'Bearer test-token', ...headers },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    environmentService = { getAppSecret: jest.fn().mockReturnValue('secret') };
    userRepo = { findById: jest.fn() };
    workspaceRepo = { findById: jest.fn() };
    moduleRef = { get: jest.fn() };

    guard = new McpAuthGuard(
      jwtService as unknown as JwtService,
      environmentService as unknown as EnvironmentService,
      userRepo as unknown as UserRepo,
      workspaceRepo as unknown as WorkspaceRepo,
      moduleRef as unknown as ModuleRef,
    );
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('access token auth', () => {
    it('should allow valid access token with MCP enabled', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id-1',
        workspaceId: 'workspace-id-1',
        type: 'access',
      });
      workspaceRepo.findById.mockResolvedValue(mockWorkspace);
      userRepo.findById.mockResolvedValue(mockUser);

      const result = await guard.canActivate(createMockContext());

      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when no Bearer token', async () => {
      const context = createMockContext({ authorization: '' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when JWT verification fails', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when payload has no workspaceId', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id-1',
        type: 'access',
      });

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when workspace not found', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id-1',
        workspaceId: 'workspace-id-1',
        type: 'access',
      });
      workspaceRepo.findById.mockResolvedValue(null);

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id-1',
        workspaceId: 'workspace-id-1',
        type: 'access',
      });
      workspaceRepo.findById.mockResolvedValue(mockWorkspace);
      userRepo.findById.mockResolvedValue(null);

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user is deactivated', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id-1',
        workspaceId: 'workspace-id-1',
        type: 'access',
      });
      workspaceRepo.findById.mockResolvedValue(mockWorkspace);
      userRepo.findById.mockResolvedValue({
        ...mockUser,
        deactivatedAt: new Date().toISOString(),
      });

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw ForbiddenException when MCP is not enabled', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id-1',
        workspaceId: 'workspace-id-1',
        type: 'access',
      });
      workspaceRepo.findById.mockResolvedValue({
        ...mockWorkspace,
        settings: { ai: { mcp: false } },
      });
      userRepo.findById.mockResolvedValue(mockUser);

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when workspace has no AI settings', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id-1',
        workspaceId: 'workspace-id-1',
        type: 'access',
      });
      workspaceRepo.findById.mockResolvedValue({
        ...mockWorkspace,
        settings: null,
      });
      userRepo.findById.mockResolvedValue(mockUser);

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('API key auth', () => {
    const mockApiKeyService = {
      validateApiKey: jest.fn(),
    };

    beforeEach(() => {
      moduleRef.get.mockReturnValue(mockApiKeyService);
    });

    it('should allow valid API key with MCP enabled', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id-1',
        workspaceId: 'workspace-id-1',
        type: 'api_key',
        apiKeyId: 'key-id-1',
      });
      mockApiKeyService.validateApiKey.mockResolvedValue({
        user: mockUser,
        workspace: mockWorkspace,
      });

      const result = await guard.canActivate(createMockContext());

      expect(result).toBe(true);
      expect(mockApiKeyService.validateApiKey).toHaveBeenCalledWith({
        sub: 'user-id-1',
        workspaceId: 'workspace-id-1',
        type: 'api_key',
        apiKeyId: 'key-id-1',
      });
    });

    it('should throw ForbiddenException when MCP disabled for API key auth', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id-1',
        workspaceId: 'workspace-id-1',
        type: 'api_key',
        apiKeyId: 'key-id-1',
      });
      mockApiKeyService.validateApiKey.mockResolvedValue({
        user: mockUser,
        workspace: { ...mockWorkspace, settings: { ai: { mcp: false } } },
      });

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw UnauthorizedException when ApiKeyService is not available', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id-1',
        workspaceId: 'workspace-id-1',
        type: 'api_key',
        apiKeyId: 'key-id-1',
      });
      moduleRef.get.mockReturnValue(null);

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when API key validation fails', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id-1',
        workspaceId: 'workspace-id-1',
        type: 'api_key',
        apiKeyId: 'key-id-1',
      });
      mockApiKeyService.validateApiKey.mockRejectedValue(
        new UnauthorizedException('API key has been revoked'),
      );

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('mcpAuth attachment', () => {
    it('should attach mcpAuth with user and workspace to request', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id-1',
        workspaceId: 'workspace-id-1',
        type: 'access',
      });
      workspaceRepo.findById.mockResolvedValue(mockWorkspace);
      userRepo.findById.mockResolvedValue(mockUser);

      const request: any = {
        headers: { authorization: 'Bearer test-token' },
      };
      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      expect(request.mcpAuth).toEqual({
        user: mockUser,
        workspace: mockWorkspace,
      });
    });
  });
});
