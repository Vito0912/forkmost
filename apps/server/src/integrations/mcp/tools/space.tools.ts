import { ForbiddenException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SpaceService } from '../../../core/space/services/space.service';
import { SpaceMemberService } from '../../../core/space/services/space-member.service';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import WorkspaceAbilityFactory from '../../../core/casl/abilities/workspace-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';
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

export function registerSpaceTools(
  server: McpServer,
  user: User,
  workspace: Workspace,
  spaceService: SpaceService,
  spaceMemberService: SpaceMemberService,
  spaceAbility: SpaceAbilityFactory,
  workspaceAbility: WorkspaceAbilityFactory,
) {
  // list_spaces: No CASL check needed — already scoped to user's spaces via spaceMemberService
  server.tool('list_spaces', 'List all spaces you have access to', {}, async () => {
    try {
      const result = await spaceMemberService.getUserSpaces(user.id, {
        limit: 100,
        query: undefined,
        adminView: undefined,
      });
      return textResult({
        items: result.items.map((space) => ({
          id: space.id,
          name: space.name,
          slug: space.slug,
          description: space.description,
        })),
      });
    } catch (error) {
      return errorResult(error);
    }
  });

  // get_space: Matches SpaceController.getSpaceInfo → spaceAbility cannot(Read, Settings)
  server.tool(
    'get_space',
    'Get details of a specific space',
    {
      spaceId: z.string().describe('Space ID'),
    },
    async ({ spaceId }) => {
      try {
        const ability = await spaceAbility.createForUser(user, spaceId);
        if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Settings)) {
          throw new ForbiddenException();
        }

        const space = await spaceService.getSpaceInfo(spaceId, workspace.id);
        return textResult({
          id: space.id,
          name: space.name,
          slug: space.slug,
          description: space.description,
          createdAt: space.createdAt,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // create_space: Matches SpaceController.createSpace → workspaceAbility cannot(Manage, Space)
  server.tool(
    'create_space',
    'Create a new space',
    {
      name: z.string().describe('Space name'),
      slug: z.string().describe('Space URL slug'),
      description: z.string().optional().describe('Space description'),
    },
    async ({ name, slug, description }) => {
      try {
        const ability = workspaceAbility.createForUser(user, workspace);
        if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Space)) {
          throw new ForbiddenException();
        }

        const space = await spaceService.createSpace(user, workspace.id, {
          name,
          slug,
          description,
        } as any);

        return textResult({
          id: space.id,
          name: space.name,
          slug: space.slug,
          description: space.description,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // update_space: Matches SpaceController.updateSpace → spaceAbility cannot(Manage, Settings)
  server.tool(
    'update_space',
    'Update a space name or description',
    {
      spaceId: z.string().describe('Space ID'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
    },
    async ({ spaceId, name, description }) => {
      try {
        const ability = await spaceAbility.createForUser(user, spaceId);
        if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
          throw new ForbiddenException();
        }

        const updated = await spaceService.updateSpace(
          { spaceId, name, description } as any,
          workspace.id,
        );

        return textResult({
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
          description: updated.description,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
