import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CommentService } from '../../../core/comment/comment.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../../core/page/page-access/page-access.service';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { htmlToJson } from '../../../collaboration/collaboration.util';

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

function normalizeCommentContent(content: string): string {
  const trimmed = content.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    JSON.parse(trimmed);
    return trimmed;
  }

  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return JSON.stringify(htmlToJson(content));
  }

  return JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: content }],
      },
    ],
  });
}

function assertWorkspace(entityWorkspaceId: string, workspaceId: string, label: string) {
  if (entityWorkspaceId !== workspaceId) {
    throw new NotFoundException(`${label} not found`);
  }
}

export function registerCommentTools(
  server: McpServer,
  user: User,
  workspace: Workspace,
  commentService: CommentService,
  pageRepo: PageRepo,
  pageAccessService: PageAccessService,
) {
  // get_comments: Matches CommentController.findPageComments → pageAccessService.validateCanView
  server.tool(
    'get_comments',
    'Get comments on a page',
    {
      pageId: z.string().describe('Page ID'),
    },
    async ({ pageId }) => {
      try {
        const page = await pageRepo.findById(pageId);
        if (!page) {
          throw new NotFoundException('Page not found');
        }

        assertWorkspace(page.workspaceId, workspace.id, 'Page');
        await pageAccessService.validateCanView(page, user);

        const result = await commentService.findByPageId(pageId, {
          limit: 100,
          query: undefined,
          adminView: undefined,
        });
        return textResult({
          items: result.items
            .filter((comment) => comment.workspaceId === workspace.id)
            .map((comment) => ({
              id: comment.id,
              content: comment.content,
              creatorId: comment.creatorId,
              createdAt: comment.createdAt,
            })),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // create_comment: Matches CommentController.create → pageAccessService.validateCanEdit
  server.tool(
    'create_comment',
    'Add a comment to a page',
    {
      pageId: z.string().describe('Page ID'),
      content: z.string().describe('Comment content in HTML or text'),
    },
    async ({ pageId, content }) => {
      try {
        const page = await pageRepo.findById(pageId);

        if (!page) {
          throw new NotFoundException('Page not found');
        }

        assertWorkspace(page.workspaceId, workspace.id, 'Page');
        await pageAccessService.validateCanEdit(page, user);

        const comment = await commentService.create(
          { userId: user.id, page, workspaceId: workspace.id },
          { pageId, content: normalizeCommentContent(content) } as any,
        );

        return textResult({
          id: comment.id,
          pageId: comment.pageId,
          content: comment.content,
          creatorId: comment.creatorId,
          createdAt: comment.createdAt,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // update_comment: Matches CommentController.update → pageAccessService.validateCanEdit
  server.tool(
    'update_comment',
    'Update an existing comment',
    {
      commentId: z.string().describe('Comment ID'),
      content: z.string().describe('Updated comment content'),
    },
    async ({ commentId, content }) => {
      try {
        const comment = await commentService.findById(commentId);

        assertWorkspace(comment.workspaceId, workspace.id, 'Comment');

        const page = await pageRepo.findById(comment.pageId);
        if (!page) {
          throw new NotFoundException('Page not found');
        }
        await pageAccessService.validateCanEdit(page, user);

        const updated = await commentService.update(
          comment,
          { commentId, content: normalizeCommentContent(content) } as any,
          user,
        );

        return textResult({
          id: updated.id,
          pageId: updated.pageId,
          content: updated.content,
          updatedAt: updated.updatedAt,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
