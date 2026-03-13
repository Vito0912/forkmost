import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyRepo } from '../../database/repos/api-key/api-key.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { TokenService } from '../auth/services/token.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { InsertableApiKey, User } from '@docmost/db/types/entity.types';
import { JwtApiKeyPayload } from '../auth/dto/jwt-payload';
import { isUserDisabled } from '../../common/helpers';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';

@Injectable()
export class ApiKeyService {
  constructor(
    private apiKeyRepo: ApiKeyRepo,
    private userRepo: UserRepo,
    private workspaceRepo: WorkspaceRepo,
    private tokenService: TokenService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async createApiKey(user: User, workspaceId: string, dto: CreateApiKeyDto) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const expiresIn = dto.expiresAt
      ? Math.floor((expiresAt.getTime() - Date.now()) / 1000)
      : undefined;

    if (expiresIn !== undefined && expiresIn <= 0) {
      throw new BadRequestException('Expiration date must be in the future');
    }

    const insertableApiKey: InsertableApiKey = {
      name: dto.name,
      creatorId: user.id,
      workspaceId,
      expiresAt,
    };

    const apiKey = await this.apiKeyRepo.insert(insertableApiKey);
    const token = await this.tokenService.generateApiToken({
      apiKeyId: apiKey.id,
      user,
      workspaceId,
      expiresIn,
    });

    this.auditService.log({
      event: AuditEvent.API_KEY_CREATED,
      resourceType: AuditResource.API_KEY,
      resourceId: apiKey.id,
      changes: {
        after: {
          name: apiKey.name,
        },
      },
    });

    return { ...apiKey, token };
  }

  async getApiKeys(
    workspaceId: string,
    pagination: PaginationOptions,
    creatorId?: string,
  ) {
    return this.apiKeyRepo.findByWorkspace(workspaceId, pagination, creatorId);
  }

  async updateApiKey(
    workspaceId: string,
    userId: string,
    canManageAll: boolean,
    dto: UpdateApiKeyDto,
  ) {
    const apiKey = await this.apiKeyRepo.findById(dto.apiKeyId);

    if (!apiKey || apiKey.workspaceId !== workspaceId) {
      throw new NotFoundException('API key not found');
    }

    if (!canManageAll && apiKey.creatorId !== userId) {
      throw new ForbiddenException('Not allowed to manage this API key');
    }

    const updatedApiKey = await this.apiKeyRepo.update(
      { name: dto.name },
      dto.apiKeyId,
    );

    this.auditService.log({
      event: AuditEvent.API_KEY_UPDATED,
      resourceType: AuditResource.API_KEY,
      resourceId: dto.apiKeyId,
      changes: {
        before: {
          name: apiKey.name,
        },
        after: {
          name: dto.name,
        },
      },
    });

    return updatedApiKey;
  }

  async revokeApiKey(
    workspaceId: string,
    userId: string,
    canManageAll: boolean,
    apiKeyId: string,
  ) {
    const apiKey = await this.apiKeyRepo.findById(apiKeyId);

    if (!apiKey || apiKey.workspaceId !== workspaceId) {
      throw new NotFoundException('API key not found');
    }

    if (!canManageAll && apiKey.creatorId !== userId) {
      throw new ForbiddenException('Not allowed to manage this API key');
    }

    await this.apiKeyRepo.softDelete(apiKeyId);

    this.auditService.log({
      event: AuditEvent.API_KEY_DELETED,
      resourceType: AuditResource.API_KEY,
      resourceId: apiKeyId,
      changes: {
        before: {
          name: apiKey.name,
        },
      },
    });
  }

  async validateApiKey(
    payload: JwtApiKeyPayload,
  ): Promise<{ user: User; workspace: any }> {
    const apiKey = await this.apiKeyRepo.findById(payload.apiKeyId);

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (apiKey.deletedAt) {
      throw new UnauthorizedException('API key has been revoked');
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    const workspace = await this.workspaceRepo.findById(payload.workspaceId);
    if (!workspace) {
      throw new UnauthorizedException();
    }

    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    void this.apiKeyRepo.updateLastUsedAt(payload.apiKeyId);

    return { user, workspace };
  }
}
