import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { RevokeApiKeyDto } from './dto/revoke-api-key.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';

@UseGuards(JwtAuthGuard)
@Controller('api-keys')
export class ApiKeyController {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  getApiKeys(
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Create, WorkspaceCaslSubject.API)) {
      throw new ForbiddenException();
    }

    return this.apiKeyService.getApiKeys(workspace.id, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  createApiKey(
    @Body() dto: CreateApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Create, WorkspaceCaslSubject.API)) {
      throw new ForbiddenException();
    }

    return this.apiKeyService.createApiKey(user, workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  updateApiKey(
    @Body() dto: UpdateApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.API)) {
      throw new ForbiddenException();
    }

    return this.apiKeyService.updateApiKey(workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  revokeApiKey(
    @Body() dto: RevokeApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.API)) {
      throw new ForbiddenException();
    }

    return this.apiKeyService.revokeApiKey(workspace.id, dto.apiKeyId);
  }
}
