import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ModuleRef } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { extractBearerTokenFromHeader, isUserDisabled } from '../../common/helpers';
import { EnvironmentService } from '../environment/environment.service';
import type { ApiKeyService } from '../../core/api-key/api-key.service';

interface JwtPayload {
  sub: string;
  workspaceId: string;
  type: 'access' | 'api_key';
}

interface JwtApiKeyPayload extends JwtPayload {
  apiKeyId: string;
  type: 'api_key';
}

type McpAuth = {
  user: Awaited<ReturnType<UserRepo['findById']>>;
  workspace: Awaited<ReturnType<WorkspaceRepo['findById']>>;
};

type McpRequest = FastifyRequest & {
  mcpAuth?: McpAuth;
};

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly environmentService: EnvironmentService,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<McpRequest>();
    const token = extractBearerTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    let payload: JwtPayload | JwtApiKeyPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload | JwtApiKeyPayload>(
        token,
        {
          secret: this.environmentService.getAppSecret(),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!payload?.workspaceId) {
      throw new UnauthorizedException();
    }

    const authResult =
      payload.type === 'api_key'
        ? await this.validateApiKey(payload as JwtApiKeyPayload)
        : await this.validateAccessToken(payload);

    const { user, workspace } = authResult;

    const workspaceSettings = workspace.settings as
      | { ai?: { mcp?: boolean } }
      | undefined;

    if (!workspaceSettings?.ai?.mcp) {
      throw new ForbiddenException('MCP is not enabled for this workspace');
    }

    request.mcpAuth = { user, workspace };
    return true;
  }

  private async validateApiKey(payload: JwtApiKeyPayload): Promise<McpAuth> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ApiKeyService } = require('../../core/api-key/api-key.service') as {
      ApiKeyService: new (...args: never[]) => ApiKeyService;
    };

    const apiKeyService = this.moduleRef.get(ApiKeyService, { strict: false });

    if (!apiKeyService) {
      throw new UnauthorizedException('API key validation unavailable');
    }

    return apiKeyService.validateApiKey(payload);
  }

  private async validateAccessToken(payload: JwtPayload): Promise<McpAuth> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException();
    }

    const workspace = await this.workspaceRepo.findById(payload.workspaceId);
    if (!workspace) {
      throw new UnauthorizedException();
    }

    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    return { user, workspace };
  }
}
