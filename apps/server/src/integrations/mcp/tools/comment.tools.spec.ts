jest.mock('../../../collaboration/collaboration.util', () => ({
  htmlToJson: jest.fn().mockReturnValue({ type: 'doc', content: [] }),
}));

jest.mock('../../../common/helpers/prosemirror/utils', () => ({}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { registerCommentTools } from './comment.tools';

describe('Comment Tools Authorization', () => {
  const toolHandlers = new Map<string, Function>();

  const mockUser = { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'member' } as any;
  const mockWorkspace = { id: 'ws-1' } as any;
  const mockPage = { id: 'page-1', spaceId: 'space-1', workspaceId: 'ws-1' };
  const mockComment = {
    id: 'comment-1',
    pageId: 'page-1',
    workspaceId: 'ws-1',
    content: '{}',
    creatorId: 'user-1',
    createdAt: new Date(),
  };

  let commentService: Record<string, jest.Mock>;
  let pageRepo: Record<string, jest.Mock>;
  let pageAccessService: Record<string, jest.Mock>;
  let spaceAbility: Record<string, jest.Mock>;
  let mockAbility: { can: jest.Mock; cannot: jest.Mock };

  beforeEach(() => {
    toolHandlers.clear();

    const mockServer = {
      tool: jest.fn((...args: any[]) => {
        const name = args[0];
        const handler = args[args.length - 1];
        toolHandlers.set(name, handler);
      }),
    };

    mockAbility = {
      can: jest.fn().mockReturnValue(true),
      cannot: jest.fn().mockReturnValue(false),
    };

    commentService = {
      findByPageId: jest.fn().mockResolvedValue({ items: [mockComment] }),
      create: jest.fn().mockResolvedValue(mockComment),
      findById: jest.fn().mockResolvedValue(mockComment),
      update: jest.fn().mockResolvedValue({ ...mockComment, updatedAt: new Date() }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    pageRepo = {
      findById: jest.fn().mockResolvedValue(mockPage),
    };

    pageAccessService = {
      validateCanView: jest.fn().mockResolvedValue(undefined),
      validateCanEdit: jest.fn().mockResolvedValue({ hasRestriction: false }),
    };

    spaceAbility = {
      createForUser: jest.fn().mockResolvedValue(mockAbility),
    };

    registerCommentTools(
      mockServer as any,
      mockUser,
      mockWorkspace,
      commentService as any,
      pageRepo as any,
      pageAccessService as any,
      spaceAbility as any,
    );
  });

  function callTool(name: string, args: Record<string, any>) {
    return toolHandlers.get(name)!(args);
  }

  describe('get_comments', () => {
    it('should call validateCanView on the page', async () => {
      await callTool('get_comments', { pageId: 'page-1' });

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(mockPage, mockUser);
    });

    it('should deny when user cannot view page', async () => {
      pageAccessService.validateCanView.mockRejectedValue(new ForbiddenException());

      const result = await callTool('get_comments', { pageId: 'page-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(commentService.findByPageId).not.toHaveBeenCalled();
    });

    it('should deny when page is in different workspace', async () => {
      pageRepo.findById.mockResolvedValue({ ...mockPage, workspaceId: 'other-ws' });

      const result = await callTool('get_comments', { pageId: 'page-1' });

      expect(result.isError).toBe(true);
      expect(pageAccessService.validateCanView).not.toHaveBeenCalled();
    });
  });

  describe('create_comment', () => {
    it('should call validateCanEdit on the page', async () => {
      await callTool('create_comment', { pageId: 'page-1', content: 'Hello' });

      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(mockPage, mockUser);
    });

    it('should deny when user cannot edit page', async () => {
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      const result = await callTool('create_comment', { pageId: 'page-1', content: 'Hello' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(commentService.create).not.toHaveBeenCalled();
    });

    it('should error when page not found', async () => {
      pageRepo.findById.mockResolvedValue(null);

      const result = await callTool('create_comment', { pageId: 'missing', content: 'Hello' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('update_comment', () => {
    it('should look up the comment page and call validateCanEdit', async () => {
      await callTool('update_comment', { commentId: 'comment-1', content: 'Updated' });

      expect(commentService.findById).toHaveBeenCalledWith('comment-1');
      expect(pageRepo.findById).toHaveBeenCalledWith('page-1');
      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(mockPage, mockUser);
    });

    it('should deny when user cannot edit the comment page', async () => {
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      const result = await callTool('update_comment', { commentId: 'comment-1', content: 'Updated' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(commentService.update).not.toHaveBeenCalled();
    });

    it('should deny when comment is in different workspace', async () => {
      commentService.findById.mockResolvedValue({ ...mockComment, workspaceId: 'other-ws' });

      const result = await callTool('update_comment', { commentId: 'comment-1', content: 'Updated' });

      expect(result.isError).toBe(true);
      expect(pageAccessService.validateCanEdit).not.toHaveBeenCalled();
    });

    it('should error when comment page not found', async () => {
      pageRepo.findById.mockResolvedValue(null);

      const result = await callTool('update_comment', { commentId: 'comment-1', content: 'Updated' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('delete_comment', () => {
    it('should delete comment when user is the owner', async () => {
      const result = await callTool('delete_comment', { commentId: 'comment-1' });

      expect(commentService.findById).toHaveBeenCalledWith('comment-1');
      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(mockPage, mockUser);
      expect(commentService.delete).toHaveBeenCalledWith('comment-1');
      expect(result.isError).toBe(false);
    });

    it('should delete comment when user is space admin', async () => {
      const otherUserComment = { ...mockComment, creatorId: 'other-user' };
      commentService.findById.mockResolvedValue(otherUserComment);

      const result = await callTool('delete_comment', { commentId: 'comment-1' });

      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-1');
      expect(commentService.delete).toHaveBeenCalledWith('comment-1');
      expect(result.isError).toBe(false);
    });

    it('should deny when user cannot edit page', async () => {
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      const result = await callTool('delete_comment', { commentId: 'comment-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(commentService.delete).not.toHaveBeenCalled();
    });

    it('should deny when user is not owner and not space admin', async () => {
      const otherUserComment = { ...mockComment, creatorId: 'other-user' };
      commentService.findById.mockResolvedValue(otherUserComment);
      mockAbility.cannot.mockReturnValue(true);

      const result = await callTool('delete_comment', { commentId: 'comment-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('You can only delete your own comments or must be a space admin');
      expect(commentService.delete).not.toHaveBeenCalled();
    });

    it('should error when comment not found', async () => {
      commentService.findById.mockRejectedValue(new NotFoundException('Comment not found'));

      const result = await callTool('delete_comment', { commentId: 'missing' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should error when page not found', async () => {
      pageRepo.findById.mockResolvedValue(null);

      const result = await callTool('delete_comment', { commentId: 'comment-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should deny when comment is in different workspace', async () => {
      commentService.findById.mockResolvedValue({ ...mockComment, workspaceId: 'other-ws' });

      const result = await callTool('delete_comment', { commentId: 'comment-1' });

      expect(result.isError).toBe(true);
      expect(pageAccessService.validateCanEdit).not.toHaveBeenCalled();
      expect(commentService.delete).not.toHaveBeenCalled();
    });
  });
});
