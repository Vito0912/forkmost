jest.mock('../../../collaboration/collaboration.util', () => ({
  jsonToMarkdown: jest.fn().mockReturnValue('# markdown'),
}));

jest.mock('../../../common/helpers/prosemirror/utils', () => ({}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { registerPageTools } from './page.tools';

describe('Page Tools Authorization', () => {
  const toolHandlers = new Map<string, Function>();

  const mockUser = { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'member' } as any;
  const mockWorkspace = { id: 'ws-1' } as any;
  const mockPage = {
    id: 'page-1',
    title: 'Test Page',
    spaceId: 'space-1',
    workspaceId: 'ws-1',
    content: null,
    position: '0',
    updatedAt: new Date(),
  };

  let pageService: Record<string, jest.Mock>;
  let pageRepo: Record<string, jest.Mock>;
  let searchService: Record<string, jest.Mock>;
  let spaceAbility: Record<string, jest.Mock>;
  let pageAccessService: Record<string, jest.Mock>;
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

    pageService = {
      create: jest.fn().mockResolvedValue({ id: 'new-page', title: 'New', spaceId: 'space-1', parentPageId: null }),
      update: jest.fn().mockResolvedValue({ id: 'page-1', title: 'Updated', spaceId: 'space-1', updatedAt: new Date() }),
      getRecentSpacePages: jest.fn().mockResolvedValue({ items: [] }),
      getSidebarPages: jest.fn().mockResolvedValue({ items: [] }),
      duplicatePage: jest.fn().mockResolvedValue({ id: 'dup-1', title: 'Copy', spaceId: 'space-1' }),
      movePage: jest.fn().mockResolvedValue(undefined),
      movePageToSpace: jest.fn().mockResolvedValue(undefined),
    };

    pageRepo = {
      findById: jest.fn().mockResolvedValue(mockPage),
    };

    searchService = {
      searchPage: jest.fn().mockResolvedValue({ items: [] }),
    };

    spaceAbility = {
      createForUser: jest.fn().mockResolvedValue(mockAbility),
    };

    pageAccessService = {
      validateCanView: jest.fn().mockResolvedValue(undefined),
      validateCanEdit: jest.fn().mockResolvedValue({ hasRestriction: false }),
    };

    registerPageTools(
      mockServer as any,
      mockUser,
      mockWorkspace,
      pageService as any,
      pageRepo as any,
      searchService as any,
      spaceAbility as any,
      pageAccessService as any,
    );
  });

  function callTool(name: string, args: Record<string, any>) {
    return toolHandlers.get(name)!(args);
  }

  describe('search_pages', () => {
    it('should check space read permission when spaceId is provided', async () => {
      await callTool('search_pages', { query: 'test', spaceId: 'space-1' });

      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-1');
    });

    it('should deny when user cannot read space pages', async () => {
      mockAbility.cannot.mockReturnValue(true);

      const result = await callTool('search_pages', { query: 'test', spaceId: 'space-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(searchService.searchPage).not.toHaveBeenCalled();
    });

    it('should skip space check when no spaceId filter', async () => {
      await callTool('search_pages', { query: 'test' });

      expect(spaceAbility.createForUser).not.toHaveBeenCalled();
      expect(searchService.searchPage).toHaveBeenCalled();
    });
  });

  describe('get_page', () => {
    it('should call validateCanView', async () => {
      await callTool('get_page', { pageId: 'page-1' });

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(mockPage, mockUser);
    });

    it('should deny when validateCanView throws', async () => {
      pageAccessService.validateCanView.mockRejectedValue(new ForbiddenException());

      const result = await callTool('get_page', { pageId: 'page-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
    });

    it('should deny when page is in different workspace', async () => {
      pageRepo.findById.mockResolvedValue({ ...mockPage, workspaceId: 'other-ws' });

      const result = await callTool('get_page', { pageId: 'page-1' });

      expect(result.isError).toBe(true);
      expect(pageAccessService.validateCanView).not.toHaveBeenCalled();
    });
  });

  describe('create_page', () => {
    it('should check space create permission for root pages', async () => {
      await callTool('create_page', { spaceId: 'space-1' });

      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-1');
    });

    it('should deny root page creation when user lacks create permission', async () => {
      mockAbility.cannot.mockReturnValue(true);

      const result = await callTool('create_page', { spaceId: 'space-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(pageService.create).not.toHaveBeenCalled();
    });

    it('should check validateCanEdit on parent for child pages', async () => {
      await callTool('create_page', { spaceId: 'space-1', parentPageId: 'page-1' });

      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(mockPage, mockUser);
      expect(spaceAbility.createForUser).not.toHaveBeenCalled();
    });

    it('should deny child page creation when user cannot edit parent', async () => {
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      const result = await callTool('create_page', { spaceId: 'space-1', parentPageId: 'page-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(pageService.create).not.toHaveBeenCalled();
    });

    it('should error when parent page not found', async () => {
      pageRepo.findById.mockResolvedValue(null);

      const result = await callTool('create_page', { spaceId: 'space-1', parentPageId: 'missing' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('update_page', () => {
    it('should call validateCanEdit', async () => {
      await callTool('update_page', { pageId: 'page-1', title: 'New Title' });

      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(mockPage, mockUser);
    });

    it('should deny when user cannot edit page', async () => {
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      const result = await callTool('update_page', { pageId: 'page-1', title: 'New Title' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(pageService.update).not.toHaveBeenCalled();
    });
  });

  describe('list_pages', () => {
    it('should check space read permission', async () => {
      await callTool('list_pages', { spaceId: 'space-1' });

      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-1');
    });

    it('should deny when user cannot read space', async () => {
      mockAbility.cannot.mockReturnValue(true);

      const result = await callTool('list_pages', { spaceId: 'space-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(pageService.getRecentSpacePages).not.toHaveBeenCalled();
    });
  });

  describe('list_child_pages', () => {
    it('should check space read permission', async () => {
      await callTool('list_child_pages', { pageId: 'page-1' });

      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-1');
    });

    it('should deny when user cannot read space', async () => {
      mockAbility.cannot.mockReturnValue(true);

      const result = await callTool('list_child_pages', { pageId: 'page-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(pageService.getSidebarPages).not.toHaveBeenCalled();
    });
  });

  describe('duplicate_page', () => {
    it('should check validateCanView and space edit permission', async () => {
      await callTool('duplicate_page', { pageId: 'page-1' });

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(mockPage, mockUser);
      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-1');
    });

    it('should deny when user cannot view page', async () => {
      pageAccessService.validateCanView.mockRejectedValue(new ForbiddenException());

      const result = await callTool('duplicate_page', { pageId: 'page-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(pageService.duplicatePage).not.toHaveBeenCalled();
    });

    it('should deny when user cannot edit in space', async () => {
      mockAbility.cannot.mockReturnValue(true);

      const result = await callTool('duplicate_page', { pageId: 'page-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(pageService.duplicatePage).not.toHaveBeenCalled();
    });
  });

  describe('copy_page_to_space', () => {
    it('should check both source and target space permissions', async () => {
      await callTool('copy_page_to_space', { pageId: 'page-1', spaceId: 'space-2' });

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(mockPage, mockUser);
      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-1');
      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-2');
    });

    it('should deny when user cannot edit in target space', async () => {
      const sourceAbility = { can: jest.fn().mockReturnValue(true), cannot: jest.fn().mockReturnValue(false) };
      const targetAbility = { can: jest.fn().mockReturnValue(false), cannot: jest.fn().mockReturnValue(true) };

      spaceAbility.createForUser
        .mockResolvedValueOnce(sourceAbility)
        .mockResolvedValueOnce(targetAbility);

      const result = await callTool('copy_page_to_space', { pageId: 'page-1', spaceId: 'space-2' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(pageService.duplicatePage).not.toHaveBeenCalled();
    });
  });

  describe('move_page', () => {
    it('should check space edit permission and validateCanEdit', async () => {
      await callTool('move_page', { pageId: 'page-1' });

      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-1');
      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(mockPage, mockUser);
    });

    it('should deny when user cannot edit in space', async () => {
      mockAbility.cannot.mockReturnValue(true);

      const result = await callTool('move_page', { pageId: 'page-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(pageService.movePage).not.toHaveBeenCalled();
    });

    it('should deny when validateCanEdit throws', async () => {
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      const result = await callTool('move_page', { pageId: 'page-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(pageService.movePage).not.toHaveBeenCalled();
    });
  });

  describe('move_page_to_space', () => {
    it('should check validateCanEdit and both space permissions', async () => {
      await callTool('move_page_to_space', { pageId: 'page-1', spaceId: 'space-2' });

      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(mockPage, mockUser);
      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-1');
      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-2');
    });

    it('should deny when user cannot edit in source space', async () => {
      const sourceAbility = { can: jest.fn().mockReturnValue(false), cannot: jest.fn().mockReturnValue(true) };
      const targetAbility = { can: jest.fn().mockReturnValue(true), cannot: jest.fn().mockReturnValue(false) };

      spaceAbility.createForUser
        .mockResolvedValueOnce(sourceAbility)
        .mockResolvedValueOnce(targetAbility);

      const result = await callTool('move_page_to_space', { pageId: 'page-1', spaceId: 'space-2' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(pageService.movePageToSpace).not.toHaveBeenCalled();
    });

    it('should deny when validateCanEdit throws', async () => {
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      const result = await callTool('move_page_to_space', { pageId: 'page-1', spaceId: 'space-2' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(pageService.movePageToSpace).not.toHaveBeenCalled();
    });
  });
});
