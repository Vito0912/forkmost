import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PageService } from '../../../core/page/services/page.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SearchService } from '../../../core/search/search.service';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import { PageAccessService } from '../../../core/page/page-access/page-access.service';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';
import { jsonToMarkdown } from '../../../collaboration/collaboration.util';
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

function assertWorkspace(entityWorkspaceId: string, workspaceId: string, label: string) {
  if (entityWorkspaceId !== workspaceId) {
    throw new NotFoundException(`${label} not found`);
  }
}

export function registerPageTools(
  server: McpServer,
  user: User,
  workspace: Workspace,
  pageService: PageService,
  pageRepo: PageRepo,
  searchService: SearchService,
  spaceAbility: SpaceAbilityFactory,
  pageAccessService: PageAccessService,
) {
  // search_pages: SearchService already scopes results by user's accessible spaces internally
  server.tool(
    'search_pages',
    'Search for pages by keyword',
    {
      query: z.string().describe('Search query'),
      spaceId: z.string().optional().describe('Filter by space ID'),
      limit: z.number().optional().describe('Max results (default 25)'),
    },
    async ({ query, spaceId, limit }) => {
      try {
        // If filtering by spaceId, verify user has read access to the space
        if (spaceId) {
          const ability = await spaceAbility.createForUser(user, spaceId);
          if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
            throw new ForbiddenException();
          }
        }

        const result = await searchService.searchPage(
          { query, spaceId, limit: limit || 25 },
          { userId: user.id, workspaceId: workspace.id },
        );

        const items = result.items.map((item) => ({
          title: item.title,
          highlight: item.highlight,
          spaceId: item.space?.id,
          pageId: item.id,
        }));

        return textResult({ items, total: items.length });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // get_page: Matches PageController.getPage → pageAccessService.validateCanView
  server.tool(
    'get_page',
    'Get the content of a specific page',
    {
      pageId: z.string().describe('The page ID'),
    },
    async ({ pageId }) => {
      try {
        const page = await pageRepo.findById(pageId, {
          includeContent: true,
          includeSpace: true,
        });

        if (!page) {
          throw new NotFoundException('Page not found');
        }

        assertWorkspace(page.workspaceId, workspace.id, 'Page');
        await pageAccessService.validateCanView(page, user);

        return textResult({
          id: page.id,
          title: page.title,
          spaceId: page.spaceId,
          content: page.content ? jsonToMarkdown(page.content) : '',
          updatedAt: page.updatedAt,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // create_page: Matches PageController.create
  // - With parentPageId: pageAccessService.validateCanEdit(parentPage)
  // - Without parentPageId (root): spaceAbility → cannot(Create, Page)
  server.tool(
    'create_page',
    'Create a new page in a space',
    {
      title: z.string().optional().describe('Page title'),
      spaceId: z.string().describe('Space ID to create in'),
      content: z.string().optional().describe('Page content in markdown'),
      parentPageId: z.string().optional().describe('Parent page ID'),
    },
    async ({ title, spaceId, content, parentPageId }) => {
      try {
        if (parentPageId) {
          // Creating child page: validate edit access on parent
          const parentPage = await pageRepo.findById(parentPageId);
          if (!parentPage) {
            throw new NotFoundException('Parent page not found');
          }
          assertWorkspace(parentPage.workspaceId, workspace.id, 'Parent page');
          await pageAccessService.validateCanEdit(parentPage, user);
        } else {
          // Creating root page: validate space-level create permission
          const ability = await spaceAbility.createForUser(user, spaceId);
          if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
            throw new ForbiddenException();
          }
        }

        const dto = {
          title,
          spaceId,
          parentPageId,
          content,
          format: content ? 'markdown' : undefined,
        };
        const page = await pageService.create(user.id, workspace.id, dto as any);

        return textResult({
          id: page.id,
          title: page.title,
          spaceId: page.spaceId,
          parentPageId: page.parentPageId,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // update_page: Matches PageController.update → pageAccessService.validateCanEdit
  server.tool(
    'update_page',
    'Update an existing page title or content',
    {
      pageId: z.string().describe('The page ID'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New content in markdown'),
    },
    async ({ pageId, title, content }) => {
      try {
        const page = await pageRepo.findById(pageId);

        if (!page) {
          throw new NotFoundException('Page not found');
        }

        assertWorkspace(page.workspaceId, workspace.id, 'Page');
        await pageAccessService.validateCanEdit(page, user);

        const dto = {
          pageId,
          title,
          content,
          operation: content ? 'replace' : undefined,
          format: content ? 'markdown' : undefined,
        };
        const updated = await pageService.update(page, dto as any, user);

        return textResult({
          id: updated.id,
          title: updated.title,
          spaceId: updated.spaceId,
          updatedAt: updated.updatedAt,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // list_pages: Matches PageController.getRecentPages → spaceAbility cannot(Read, Page)
  server.tool(
    'list_pages',
    'List recent pages in a space',
    {
      spaceId: z.string().describe('Space ID'),
      limit: z.number().optional().describe('Max results (default 20)'),
    },
    async ({ spaceId, limit }) => {
      try {
        const ability = await spaceAbility.createForUser(user, spaceId);
        if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
          throw new ForbiddenException();
        }

        const result = await pageService.getRecentSpacePages(spaceId, user.id, {
          limit: limit || 20,
          query: undefined,
          adminView: undefined,
        });

        return textResult({
          items: result.items
            .filter((item) => item.workspaceId === workspace.id)
            .map((item) => ({
              title: item.title,
              pageId: item.id,
              updatedAt: item.updatedAt,
            })),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // list_child_pages: Matches PageController.getSidebarPages → spaceAbility cannot(Read, Page)
  server.tool(
    'list_child_pages',
    'List child pages of a specific page',
    {
      pageId: z.string().describe('Parent page ID'),
    },
    async ({ pageId }) => {
      try {
        const page = await pageRepo.findById(pageId);

        if (!page) {
          throw new NotFoundException('Page not found');
        }

        assertWorkspace(page.workspaceId, workspace.id, 'Page');

        const ability = await spaceAbility.createForUser(user, page.spaceId);
        if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
          throw new ForbiddenException();
        }

        const result = await pageService.getSidebarPages(
          page.spaceId,
          {
            limit: 50,
            query: undefined,
            adminView: undefined,
          },
          pageId,
          user.id,
        );

        return textResult({
          items: result.items.map((item) => ({
            pageId: item.id,
            title: item.title,
            hasChildren: item.hasChildren,
          })),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // duplicate_page: Matches PageController.duplicate (same space)
  // → spaceAbility cannot(Edit, Page) + pageAccessService.validateCanView
  server.tool(
    'duplicate_page',
    'Duplicate a page within its space',
    {
      pageId: z.string().describe('Page ID to duplicate'),
    },
    async ({ pageId }) => {
      try {
        const page = await pageRepo.findById(pageId, { includeContent: true });

        if (!page) {
          throw new NotFoundException('Page not found');
        }

        assertWorkspace(page.workspaceId, workspace.id, 'Page');

        await pageAccessService.validateCanView(page, user);

        const ability = await spaceAbility.createForUser(user, page.spaceId);
        if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
          throw new ForbiddenException();
        }

        const duplicated = await pageService.duplicatePage(page, undefined, user);

        return textResult({
          id: duplicated.id,
          title: duplicated.title,
          spaceId: duplicated.spaceId,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // copy_page_to_space: Matches PageController.duplicate (cross-space)
  // → BOTH source and target space need Edit permission + pageAccessService.validateCanView
  server.tool(
    'copy_page_to_space',
    'Copy a page to a different space',
    {
      pageId: z.string().describe('Page ID to copy'),
      spaceId: z.string().describe('Target space ID'),
    },
    async ({ pageId, spaceId }) => {
      try {
        const page = await pageRepo.findById(pageId, { includeContent: true });

        if (!page) {
          throw new NotFoundException('Page not found');
        }

        assertWorkspace(page.workspaceId, workspace.id, 'Page');

        await pageAccessService.validateCanView(page, user);

        // Check edit permission on both source and target spaces
        const [sourceAbility, targetAbility] = await Promise.all([
          spaceAbility.createForUser(user, page.spaceId),
          spaceAbility.createForUser(user, spaceId),
        ]);

        if (
          sourceAbility.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page) ||
          targetAbility.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)
        ) {
          throw new ForbiddenException();
        }

        const copied = await pageService.duplicatePage(page, spaceId, user);

        return textResult({
          id: copied.id,
          title: copied.title,
          spaceId: copied.spaceId,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // move_page: Matches PageController.movePage
  // → spaceAbility cannot(Edit, Page) + pageAccessService.validateCanEdit
  server.tool(
    'move_page',
    'Move a page to a different position or parent',
    {
      pageId: z.string().describe('Page ID to move'),
      parentPageId: z.string().optional().describe('New parent page ID'),
      position: z.string().optional().describe('New position (fractional index)'),
    },
    async ({ pageId, parentPageId, position }) => {
      try {
        const page = await pageRepo.findById(pageId);

        if (!page) {
          throw new NotFoundException('Page not found');
        }

        assertWorkspace(page.workspaceId, workspace.id, 'Page');

        const ability = await spaceAbility.createForUser(user, page.spaceId);
        if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
          throw new ForbiddenException();
        }

        await pageAccessService.validateCanEdit(page, user);

        await pageService.movePage(
          {
            pageId,
            parentPageId: parentPageId ?? null,
            position: position ?? page.position,
            after: null,
            before: null,
          } as any,
          page,
        );

        return textResult('Page moved successfully');
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // move_page_to_space: Matches PageController.movePageToSpace
  // → BOTH source and target space need Edit permission + pageAccessService.validateCanEdit
  server.tool(
    'move_page_to_space',
    'Move a page to a different space',
    {
      pageId: z.string().describe('Page ID to move'),
      spaceId: z.string().describe('Target space ID'),
    },
    async ({ pageId, spaceId }) => {
      try {
        const page = await pageRepo.findById(pageId);

        if (!page) {
          throw new NotFoundException('Page not found');
        }

        assertWorkspace(page.workspaceId, workspace.id, 'Page');

        await pageAccessService.validateCanEdit(page, user);

        // Check edit permission on both source and target spaces
        const [sourceAbility, targetAbility] = await Promise.all([
          spaceAbility.createForUser(user, page.spaceId),
          spaceAbility.createForUser(user, spaceId),
        ]);

        if (
          sourceAbility.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page) ||
          targetAbility.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)
        ) {
          throw new ForbiddenException();
        }

        await pageService.movePageToSpace(page, spaceId, user.id);

        return textResult('Page moved to space successfully');
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
