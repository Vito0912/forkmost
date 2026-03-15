import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PageService } from '../../core/page/services/page.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceService } from '../../core/space/services/space.service';
import { SpaceMemberService } from '../../core/space/services/space-member.service';
import { CommentService } from '../../core/comment/comment.service';
import { SearchService } from '../../core/search/search.service';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { registerPageTools } from './tools/page.tools';
import { registerSpaceTools } from './tools/space.tools';
import { registerCommentTools } from './tools/comment.tools';
import { registerOtherTools } from './tools/other.tools';

@Injectable()
export class McpServerFactory {
  constructor(
    private readonly pageService: PageService,
    private readonly pageRepo: PageRepo,
    private readonly spaceService: SpaceService,
    private readonly spaceMemberService: SpaceMemberService,
    private readonly commentService: CommentService,
    private readonly searchService: SearchService,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly userRepo: UserRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly pageAccessService: PageAccessService,
  ) {}

  createServer(user: any, workspace: any): McpServer {
    const server = new McpServer({
      name: 'Forkmost',
      version: '1.0.0',
    });

    registerPageTools(
      server,
      user,
      workspace,
      this.pageService,
      this.pageRepo,
      this.searchService,
      this.spaceAbility,
      this.pageAccessService,
    );
    registerSpaceTools(
      server,
      user,
      workspace,
      this.spaceService,
      this.spaceMemberService,
      this.spaceAbility,
      this.workspaceAbility,
    );
    registerCommentTools(
      server,
      user,
      workspace,
      this.commentService,
      this.pageRepo,
      this.pageAccessService,
    );
    registerOtherTools(
      server,
      user,
      workspace,
      this.attachmentRepo,
      this.userRepo,
      this.spaceMemberService,
      this.workspaceAbility,
    );

    return server;
  }
}
