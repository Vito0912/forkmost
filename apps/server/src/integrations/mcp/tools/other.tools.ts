import { ForbiddenException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { SpaceMemberService } from '../../../core/space/services/space-member.service';
import WorkspaceAbilityFactory from '../../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../../core/casl/interfaces/workspace-ability.type';
import { User, Workspace } from '@docmost/db/types/entity.types';

function textResult(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  const message =
    error instanceof ForbiddenException
      ? 'Permission denied'
      : error instanceof Error
        ? error.message
        : 'Unknown error';
  return {
    content: [
      {
        type: 'text' as const,
        text: `Error: ${message}`,
      },
    ],
    isError: true,
  };
}

export function registerOtherTools(
  server: McpServer,
  user: User,
  workspace: Workspace,
  attachmentRepo: AttachmentRepo,
  userRepo: UserRepo,
  spaceMemberService: SpaceMemberService,
  workspaceAbility: WorkspaceAbilityFactory,
) {
  // search_attachments: Already scoped to user's spaces via spaceMemberService.getUserSpaces
  server.tool(
    'search_attachments',
    'Search for file attachments across the workspace',
    {
      query: z.string().describe('Search query for filenames'),
    },
    async ({ query }) => {
      try {
        const spaces = await spaceMemberService.getUserSpaces(user.id, {
          limit: 100,
          query: undefined,
          adminView: undefined,
        });
        const spaceIds = spaces.items.map((space) => space.id);

        const attachments = await attachmentRepo.searchByFileName(
          query,
          workspace.id,
          spaceIds,
          25,
        );

        return textResult({
          items: attachments.map((attachment) => ({
            id: attachment.id,
            fileName: attachment.fileName,
            fileSize: attachment.fileSize,
            type: attachment.type,
            pageId: attachment.pageId,
            createdAt: attachment.createdAt,
          })),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // list_workspace_members: Requires workspaceAbility Read on Member
  server.tool(
    'list_workspace_members',
    'List members of the workspace',
    {},
    async () => {
      try {
        const ability = workspaceAbility.createForUser(user, workspace);
        if (ability.cannot(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Member)) {
          throw new ForbiddenException();
        }

        const result = await userRepo.getUsersPaginated(workspace.id, {
          limit: 100,
          query: undefined,
          adminView: undefined,
        });
        return textResult({
          items: result.items.map((member) => ({
            id: member.id,
            name: member.name,
            email: member.email,
            role: member.role,
          })),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // get_current_user: No permission check needed — returns own info
  server.tool('get_current_user', 'Get details of the authenticated user', {}, async () => {
    try {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return errorResult(error);
    }
  });
}
