import { BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  createMockAuditService,
  createMockFastifyReply,
  createMockUser,
  createMockWorkspace,
} from '../../test-utils/test-helpers';
import { AuthController } from './auth.controller';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordResetDto } from './dto/password-reset.dto';
import { VerifyUserTokenDto } from './dto/verify-user-token.dto';
import { AuthService } from './services/auth.service';

jest.mock('./services/auth.service', () => ({
  AuthService: class AuthService {},
}));

jest.mock('./guards/setup.guard', () => ({
  SetupGuard: class SetupGuard {
    canActivate() {
      return true;
    }
  },
}));

jest.mock('../../common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

describe('AuthController', () => {
  let controller: AuthController;

  let authService: {
    login: jest.Mock;
    setup: jest.Mock;
    changePassword: jest.Mock;
    forgotPassword: jest.Mock;
    passwordReset: jest.Mock;
    verifyUserToken: jest.Mock;
    getCollabToken: jest.Mock;
  };
  let environmentService: {
    getCookieExpiresIn: jest.Mock;
    isHttps: jest.Mock;
  };
  let moduleRef: {
    get: jest.Mock;
  };
  let auditService: IAuditService;

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      setup: jest.fn(),
      changePassword: jest.fn(),
      forgotPassword: jest.fn(),
      passwordReset: jest.fn(),
      verifyUserToken: jest.fn(),
      getCollabToken: jest.fn(),
    };

    const expiresAt = new Date('2030-01-01T00:00:00.000Z');
    environmentService = {
      getCookieExpiresIn: jest.fn().mockReturnValue(expiresAt),
      isHttps: jest.fn().mockReturnValue(true),
    };

    moduleRef = {
      get: jest.fn(),
    };

    auditService = createMockAuditService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: EnvironmentService, useValue: environmentService },
        { provide: ModuleRef, useValue: moduleRef },
        { provide: AUDIT_SERVICE, useValue: auditService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login', () => {
    it('logs in user and sets auth cookie', async () => {
      const workspace = createMockWorkspace({ id: 'ws-1' });
      const reply = createMockFastifyReply();
      const loginDto: LoginDto = {
        email: 'user@example.com',
        password: 'password-123',
      };
      authService.login.mockResolvedValue('auth-token-1');

      const result = await controller.login(workspace, reply, loginDto);

      expect(result).toBeUndefined();
      expect(authService.login).toHaveBeenCalledWith(loginDto, 'ws-1');
      expect(reply.setCookie).toHaveBeenCalledWith(
        'authToken',
        'auth-token-1',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
          secure: true,
        }),
      );
    });

    it('passes login dto and workspace id to service', async () => {
      const workspace = createMockWorkspace({ id: 'ws-service' });
      const reply = createMockFastifyReply();
      const loginDto: LoginDto = {
        email: 'service@example.com',
        password: 'password-456',
      };
      authService.login.mockResolvedValue('auth-token-2');

      await controller.login(workspace, reply, loginDto);

      expect(authService.login).toHaveBeenCalledWith(loginDto, 'ws-service');
    });

    it('throws when workspace enforces sso', async () => {
      const workspace = createMockWorkspace({ enforceSso: true });
      const reply = createMockFastifyReply();
      const loginDto: LoginDto = {
        email: 'blocked@example.com',
        password: 'password-123',
      };

      await expect(
        controller.login(workspace, reply, loginDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(authService.login).not.toHaveBeenCalled();
      expect(reply.setCookie).not.toHaveBeenCalled();
    });

    it('handles missing mfa module and falls back to auth service login', async () => {
      const workspace = createMockWorkspace({ id: 'ws-fallback' });
      const reply = createMockFastifyReply();
      const loginDto: LoginDto = {
        email: 'fallback@example.com',
        password: 'password-123',
      };
      authService.login.mockResolvedValue('fallback-token');

      await controller.login(workspace, reply, loginDto);

      expect(moduleRef.get).not.toHaveBeenCalled();
      expect(authService.login).toHaveBeenCalledWith(loginDto, 'ws-fallback');
      expect(reply.setCookie).toHaveBeenCalledWith(
        'authToken',
        'fallback-token',
        expect.any(Object),
      );
    });

    it('propagates auth service login error', async () => {
      const workspace = createMockWorkspace({ id: 'ws-error' });
      const reply = createMockFastifyReply();
      const loginDto: LoginDto = {
        email: 'error@example.com',
        password: 'password-123',
      };
      const loginError = new Error('invalid credentials');
      authService.login.mockRejectedValue(loginError);

      await expect(controller.login(workspace, reply, loginDto)).rejects.toThrow(
        'invalid credentials',
      );
      expect(reply.setCookie).not.toHaveBeenCalled();
    });
  });

  describe('setup', () => {
    it('sets up workspace and sets auth cookie', async () => {
      const reply = createMockFastifyReply();
      const setupDto: CreateAdminUserDto = {
        name: 'Owner',
        email: 'owner@example.com',
        password: 'password-123',
        workspaceName: 'Workspace Alpha',
        hostname: 'workspace-alpha',
      };
      const workspace = createMockWorkspace({ id: 'workspace-setup' });
      authService.setup.mockResolvedValue({
        workspace,
        authToken: 'setup-token',
      });

      const result = await controller.setupWorkspace(reply, setupDto);

      expect(authService.setup).toHaveBeenCalledWith(setupDto);
      expect(reply.setCookie).toHaveBeenCalledWith(
        'authToken',
        'setup-token',
        expect.any(Object),
      );
      expect(result).toEqual(workspace);
    });

    it('passes setup dto to auth service', async () => {
      const reply = createMockFastifyReply();
      const setupDto: CreateAdminUserDto = {
        name: 'Admin',
        email: 'admin@example.com',
        password: 'password-123',
        workspaceName: 'Workspace Beta',
        hostname: 'workspace-beta',
      };
      authService.setup.mockResolvedValue({
        workspace: createMockWorkspace(),
        authToken: 'setup-token-2',
      });

      await controller.setupWorkspace(reply, setupDto);

      expect(authService.setup).toHaveBeenCalledWith(setupDto);
    });

    it('propagates setup error', async () => {
      const reply = createMockFastifyReply();
      const setupDto: CreateAdminUserDto = {
        name: 'Admin',
        email: 'admin@example.com',
        password: 'password-123',
        workspaceName: 'Workspace Gamma',
        hostname: 'workspace-gamma',
      };
      authService.setup.mockRejectedValue(new Error('setup failed'));

      await expect(controller.setupWorkspace(reply, setupDto)).rejects.toThrow(
        'setup failed',
      );
      expect(reply.setCookie).not.toHaveBeenCalled();
    });
  });

  describe('change-password', () => {
    it('changes password with user and workspace ids', async () => {
      const dto: ChangePasswordDto = {
        oldPassword: 'old-password',
        newPassword: 'new-password',
      };
      const user = createMockUser({ id: 'user-123' });
      const workspace = createMockWorkspace({ id: 'workspace-123' });

      await controller.changePassword(dto, user, workspace);

      expect(authService.changePassword).toHaveBeenCalledWith(
        dto,
        'user-123',
        'workspace-123',
      );
    });

    it('returns auth service result', async () => {
      const dto: ChangePasswordDto = {
        oldPassword: 'old-password',
        newPassword: 'new-password',
      };
      const user = createMockUser();
      const workspace = createMockWorkspace();
      authService.changePassword.mockResolvedValue(undefined);

      const result = await controller.changePassword(dto, user, workspace);

      expect(result).toBeUndefined();
    });

    it('propagates change password error', async () => {
      const dto: ChangePasswordDto = {
        oldPassword: 'old-password',
        newPassword: 'new-password',
      };
      const user = createMockUser();
      const workspace = createMockWorkspace();
      authService.changePassword.mockRejectedValue(
        new Error('password change failed'),
      );

      await expect(controller.changePassword(dto, user, workspace)).rejects.toThrow(
        'password change failed',
      );
    });
  });

  describe('forgot-password', () => {
    it('sends forgot password request to service', async () => {
      const dto: ForgotPasswordDto = {
        email: 'forgot@example.com',
      };
      const workspace = createMockWorkspace({ id: 'forgot-ws' });

      await controller.forgotPassword(dto, workspace);

      expect(authService.forgotPassword).toHaveBeenCalledWith(dto, workspace);
    });

    it('throws when workspace enforces sso', async () => {
      const dto: ForgotPasswordDto = {
        email: 'forgot@example.com',
      };
      const workspace = createMockWorkspace({ enforceSso: true });

      await expect(controller.forgotPassword(dto, workspace)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(authService.forgotPassword).not.toHaveBeenCalled();
    });

    it('propagates forgot password service error', async () => {
      const dto: ForgotPasswordDto = {
        email: 'forgot@example.com',
      };
      const workspace = createMockWorkspace();
      authService.forgotPassword.mockRejectedValue(new Error('forgot failed'));

      await expect(controller.forgotPassword(dto, workspace)).rejects.toThrow(
        'forgot failed',
      );
    });
  });

  describe('password-reset', () => {
    it('returns requiresLogin true when service requires login', async () => {
      const reply = createMockFastifyReply();
      const dto: PasswordResetDto = {
        token: 'reset-token',
        newPassword: 'new-password',
      };
      const workspace = createMockWorkspace({ id: 'reset-ws' });
      authService.passwordReset.mockResolvedValue({ requiresLogin: true });

      const result = await controller.passwordReset(reply, dto, workspace);

      expect(authService.passwordReset).toHaveBeenCalledWith(dto, workspace);
      expect(result).toEqual({ requiresLogin: true });
      expect(reply.setCookie).not.toHaveBeenCalled();
    });

    it('sets cookie and returns requiresLogin false when auth token is returned', async () => {
      const reply = createMockFastifyReply();
      const dto: PasswordResetDto = {
        token: 'reset-token',
        newPassword: 'new-password',
      };
      const workspace = createMockWorkspace();
      authService.passwordReset.mockResolvedValue({
        requiresLogin: false,
        authToken: 'reset-auth-token',
      });

      const result = await controller.passwordReset(reply, dto, workspace);

      expect(authService.passwordReset).toHaveBeenCalledWith(dto, workspace);
      expect(reply.setCookie).toHaveBeenCalledWith(
        'authToken',
        'reset-auth-token',
        expect.any(Object),
      );
      expect(result).toEqual({ requiresLogin: false });
    });

    it('passes dto and workspace to password reset service', async () => {
      const reply = createMockFastifyReply();
      const dto: PasswordResetDto = {
        token: 'reset-token-2',
        newPassword: 'new-password-2',
      };
      const workspace = createMockWorkspace({ id: 'reset-workspace-2' });
      authService.passwordReset.mockResolvedValue({ requiresLogin: true });

      await controller.passwordReset(reply, dto, workspace);

      expect(authService.passwordReset).toHaveBeenCalledWith(dto, workspace);
    });

    it('propagates password reset service error', async () => {
      const reply = createMockFastifyReply();
      const dto: PasswordResetDto = {
        token: 'reset-token-3',
        newPassword: 'new-password-3',
      };
      const workspace = createMockWorkspace();
      authService.passwordReset.mockRejectedValue(new Error('reset failed'));

      await expect(controller.passwordReset(reply, dto, workspace)).rejects.toThrow(
        'reset failed',
      );
    });
  });

  describe('verify-token', () => {
    it('passes dto and workspace id to verify user token service', async () => {
      const dto: VerifyUserTokenDto = {
        token: 'verify-token',
        type: 'forgot_password',
      };
      const workspace = createMockWorkspace({ id: 'verify-ws' });

      await controller.verifyResetToken(dto, workspace);

      expect(authService.verifyUserToken).toHaveBeenCalledWith(dto, 'verify-ws');
    });

    it('returns auth service result', async () => {
      const dto: VerifyUserTokenDto = {
        token: 'verify-token-2',
        type: 'forgot_password',
      };
      const workspace = createMockWorkspace();
      authService.verifyUserToken.mockResolvedValue(undefined);

      const result = await controller.verifyResetToken(dto, workspace);

      expect(result).toBeUndefined();
    });

    it('propagates verify token service error', async () => {
      const dto: VerifyUserTokenDto = {
        token: 'verify-token-3',
        type: 'forgot_password',
      };
      const workspace = createMockWorkspace();
      authService.verifyUserToken.mockRejectedValue(new Error('invalid token'));

      await expect(controller.verifyResetToken(dto, workspace)).rejects.toThrow(
        'invalid token',
      );
    });
  });

  describe('collab-token', () => {
    it('passes user and workspace id to collab token service', async () => {
      const user = createMockUser({ id: 'collab-user' });
      const workspace = createMockWorkspace({ id: 'collab-workspace' });
      authService.getCollabToken.mockResolvedValue({ token: 'collab-token' });

      await controller.collabToken(user, workspace);

      expect(authService.getCollabToken).toHaveBeenCalledWith(
        user,
        'collab-workspace',
      );
    });

    it('returns collab token payload from service', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      authService.getCollabToken.mockResolvedValue({ token: 'collab-token-2' });

      const result = await controller.collabToken(user, workspace);

      expect(result).toEqual({ token: 'collab-token-2' });
    });

    it('propagates collab token service errors', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      authService.getCollabToken.mockRejectedValue(new Error('collab failed'));

      await expect(controller.collabToken(user, workspace)).rejects.toThrow(
        'collab failed',
      );
    });
  });

  describe('logout', () => {
    it('clears auth cookie', async () => {
      const user = createMockUser({ id: 'logout-user' });
      const reply = createMockFastifyReply();

      await controller.logout(user, reply);

      expect(reply.clearCookie).toHaveBeenCalledWith('authToken');
    });

    it('writes user logout audit event', async () => {
      const user = createMockUser({ id: 'logout-user-2' });
      const reply = createMockFastifyReply();

      await controller.logout(user, reply);

      expect(auditService.log).toHaveBeenCalledWith({
        event: AuditEvent.USER_LOGOUT,
        resourceType: AuditResource.USER,
        resourceId: 'logout-user-2',
      });
    });

    it('returns undefined on logout', async () => {
      const user = createMockUser();
      const reply = createMockFastifyReply();

      const result = await controller.logout(user, reply);

      expect(result).toBeUndefined();
    });
  });

  describe('setAuthCookie', () => {
    it('sets auth cookie with expected options', () => {
      const reply = createMockFastifyReply();
      const token = 'cookie-token';
      const expiresAt = new Date('2030-01-01T00:00:00.000Z');
      environmentService.getCookieExpiresIn.mockReturnValue(expiresAt);
      environmentService.isHttps.mockReturnValue(true);

      controller.setAuthCookie(reply, token);

      expect(reply.setCookie).toHaveBeenCalledWith('authToken', 'cookie-token', {
        httpOnly: true,
        path: '/',
        expires: expiresAt,
        secure: true,
      });
      expect(environmentService.getCookieExpiresIn).toHaveBeenCalledTimes(1);
      expect(environmentService.isHttps).toHaveBeenCalledTimes(1);
    });

    it('sets secure false when running over http', () => {
      const reply = createMockFastifyReply();
      const expiresAt = new Date('2031-02-02T00:00:00.000Z');
      environmentService.getCookieExpiresIn.mockReturnValue(expiresAt);
      environmentService.isHttps.mockReturnValue(false);

      controller.setAuthCookie(reply, 'plain-http-token');

      expect(reply.setCookie).toHaveBeenCalledWith(
        'authToken',
        'plain-http-token',
        {
          httpOnly: true,
          path: '/',
          expires: expiresAt,
          secure: false,
        },
      );
    });
  });

  describe('moduleRef integration', () => {
    it('does not query moduleRef for mfa service when module is unavailable', async () => {
      const getSpy = jest.spyOn(moduleRef, 'get');
      const workspace = createMockWorkspace();
      const reply = createMockFastifyReply();
      const loginDto: LoginDto = {
        email: 'module-ref@example.com',
        password: 'password-123',
      };
      authService.login.mockResolvedValue('token');

      await controller.login(workspace, reply, loginDto);

      expect(getSpy).not.toHaveBeenCalled();
    });
  });
});
