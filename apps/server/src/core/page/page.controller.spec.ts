import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { AuditEvent } from '../../common/events/audit-events';
import {
  createMockAbility,
  createMockAuditService,
  createMockPage,
  createMockPageHistory,
  createMockSpaceAbilityFactory,
  createMockUser,
  createMockWorkspace,
  createPaginationResult,
} from '../../test-utils/test-helpers';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { PageController } from './page.controller';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { SpaceCaslAction, SpaceCaslSubject } from '../casl/interfaces/space-ability.type';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PageAccessService } from './page-access/page-access.service';
import { PageHistoryService } from './services/page-history.service';
import { PageService } from './services/page.service';
import { jsonToHtml, jsonToMarkdown } from '../../collaboration/collaboration.util';

jest.mock('./services/page.service', () => ({
  PageService: class PageService {},
}));

jest.mock('../../common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

jest.mock('../../collaboration/collaboration.util', () => ({
  jsonToHtml: jest.fn().mockReturnValue('<p>mock-html</p>'),
  jsonToMarkdown: jest.fn().mockReturnValue('mock-markdown'),
}));

describe('PageController', () => {
  let controller: PageController;
  let pageService: any;
  let pageRepo: any;
  let pageHistoryService: any;
  let spaceAbilityFactory: any;
  let pageAccessService: any;
  let auditService: any;

  const user = createMockUser();
  const workspace = createMockWorkspace();

  beforeEach(async () => {
    jest.clearAllMocks();

    pageService = {
      create: jest.fn(),
      update: jest.fn(),
      removePage: jest.fn(),
      forceDelete: jest.fn(),
      getRecentPages: jest.fn(),
      getRecentSpacePages: jest.fn(),
      getDeletedSpacePages: jest.fn(),
      getSidebarPages: jest.fn(),
      movePageToSpace: jest.fn(),
      duplicatePage: jest.fn(),
      movePage: jest.fn(),
      getPageBreadCrumbs: jest.fn(),
    };

    pageRepo = {
      findById: jest.fn(),
      restorePage: jest.fn(),
    };

    pageHistoryService = {
      findHistoryByPageId: jest.fn(),
      findById: jest.fn(),
    };

    spaceAbilityFactory = createMockSpaceAbilityFactory(createMockAbility());

    pageAccessService = {
      validateCanView: jest.fn().mockResolvedValue(undefined),
      validateCanEdit: jest.fn().mockResolvedValue({ hasRestriction: false }),
      validateCanViewWithPermissions: jest
        .fn()
        .mockResolvedValue({ canEdit: true, hasRestriction: false }),
    };

    auditService = createMockAuditService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PageController],
      providers: [
        { provide: PageService, useValue: pageService },
        { provide: PageRepo, useValue: pageRepo },
        { provide: PageHistoryService, useValue: pageHistoryService },
        { provide: SpaceAbilityFactory, useValue: spaceAbilityFactory },
        { provide: PageAccessService, useValue: pageAccessService },
        { provide: JwtAuthGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: AUDIT_SERVICE, useValue: auditService },
      ],
    }).compile();

    controller = module.get<PageController>(PageController);
  });

  describe('POST /pages/info', () => {
    it('returns page with permissions', async () => {
      const page = createMockPage();
      pageRepo.findById.mockResolvedValue(page);

      const result = await controller.getPage(
        { pageId: page.id, includeSpace: false, includeContent: false },
        user,
      );

      expect(pageRepo.findById).toHaveBeenCalledWith(page.id, {
        includeSpace: true,
        includeContent: true,
        includeCreator: true,
        includeLastUpdatedBy: true,
        includeContributors: true,
      });
      expect(pageAccessService.validateCanViewWithPermissions).toHaveBeenCalledWith(
        page,
        user,
      );
      expect(result).toEqual({
        ...page,
        permissions: { canEdit: true, hasRestriction: false },
      });
    });

    it('throws when page does not exist', async () => {
      pageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.getPage(
          { pageId: 'missing-page', includeSpace: false, includeContent: false },
          user,
        ),
      ).rejects.toThrow(new NotFoundException('Page not found'));
    });

    it('converts content to markdown when format is markdown', async () => {
      const page = createMockPage();
      pageRepo.findById.mockResolvedValue(page);

      const result = await controller.getPage(
        {
          pageId: page.id,
          includeSpace: false,
          includeContent: false,
          format: 'markdown',
        },
        user,
      );

      expect(jsonToMarkdown).toHaveBeenCalledWith(page.content);
      expect(result.content).toBe('mock-markdown');
    });

    it('converts content to html when format is html', async () => {
      const page = createMockPage();
      pageRepo.findById.mockResolvedValue(page);

      const result = await controller.getPage(
        {
          pageId: page.id,
          includeSpace: false,
          includeContent: false,
          format: 'html',
        },
        user,
      );

      expect(jsonToHtml).toHaveBeenCalledWith(page.content);
      expect(result.content).toBe('<p>mock-html</p>');
    });

    it('returns json content without conversion when format is json', async () => {
      const page = createMockPage();
      pageRepo.findById.mockResolvedValue(page);

      const result = await controller.getPage(
        {
          pageId: page.id,
          includeSpace: false,
          includeContent: false,
          format: 'json',
        },
        user,
      );

      expect(jsonToHtml).not.toHaveBeenCalled();
      expect(jsonToMarkdown).not.toHaveBeenCalled();
      expect(result.content).toEqual(page.content);
    });
  });

  describe('POST /pages/create', () => {
    it('creates a root level page and checks space ability', async () => {
      const dto = { spaceId: 'space-a', title: 'A' };
      const created = createMockPage({ spaceId: dto.spaceId });
      pageService.create.mockResolvedValue(created);

      const result = await controller.create(dto, user, workspace);

      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, dto.spaceId);
      expect(pageService.create).toHaveBeenCalledWith(user.id, workspace.id, dto);
      expect(result.permissions).toEqual({ canEdit: true, hasRestriction: false });
    });

    it('creates under parent page and validates parent edit permission', async () => {
      const parent = createMockPage({ id: 'parent-page', spaceId: 'space-a' });
      const dto = { spaceId: 'space-a', parentPageId: parent.id, title: 'child' };
      const created = createMockPage({ id: 'child-page', parentPageId: parent.id, spaceId: 'space-a' });
      pageRepo.findById.mockResolvedValue(parent);
      pageService.create.mockResolvedValue(created);

      await controller.create(dto, user, workspace);

      expect(pageRepo.findById).toHaveBeenCalledWith(parent.id);
      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(parent, user);
      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });

    it('throws when parent page does not exist', async () => {
      pageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.create({ spaceId: 'space-a', parentPageId: 'missing' }, user, workspace),
      ).rejects.toThrow(new NotFoundException('Parent page not found'));
    });

    it('throws when parent page is in another space', async () => {
      const parent = createMockPage({ id: 'parent-page', spaceId: 'space-b' });
      pageRepo.findById.mockResolvedValue(parent);

      await expect(
        controller.create({ spaceId: 'space-a', parentPageId: parent.id }, user, workspace),
      ).rejects.toThrow(new NotFoundException('Parent page not found'));
    });

    it('throws when space-level create permission is denied', async () => {
      const deniedAbility = createMockAbility({ can: false });
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);

      await expect(controller.create({ spaceId: 'space-a' }, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns created page with permissions', async () => {
      const dto = { spaceId: 'space-a', title: 'Test' };
      const created = createMockPage({ id: 'created-page', spaceId: 'space-a' });
      pageService.create.mockResolvedValue(created);
      pageAccessService.validateCanViewWithPermissions.mockResolvedValue({
        canEdit: false,
        hasRestriction: true,
      });

      const result = await controller.create(dto, user, workspace);

      expect(result.permissions).toEqual({ canEdit: false, hasRestriction: true });
    });

    it('writes PAGE_CREATED audit log', async () => {
      const dto = { spaceId: 'space-a', title: 'Created' };
      const created = createMockPage({ id: 'created-page', spaceId: 'space-a', title: 'Created' });
      pageService.create.mockResolvedValue(created);

      await controller.create(dto, user, workspace);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.PAGE_CREATED,
          resourceId: created.id,
          spaceId: created.spaceId,
        }),
      );
    });

    it('converts content when create format is markdown', async () => {
      const dto = { spaceId: 'space-a', title: 'Created', format: 'markdown' as const };
      const created = createMockPage({ id: 'created-page', content: { type: 'doc', content: [] } });
      pageService.create.mockResolvedValue(created);

      const result = await controller.create(dto, user, workspace);

      expect(jsonToMarkdown).toHaveBeenCalledWith(created.content);
      expect(result.content).toBe('mock-markdown');
    });
  });

  describe('POST /pages/update', () => {
    it('updates page by calling pageService.update', async () => {
      const page = createMockPage({ id: 'page-a' });
      const updated = createMockPage({ id: 'page-a', title: 'Updated' });
      pageRepo.findById.mockResolvedValue(page);
      pageService.update.mockResolvedValue(updated);

      const result = await controller.update({ pageId: page.id, title: 'Updated' }, user);

      expect(pageService.update).toHaveBeenCalledWith(page, { pageId: page.id, title: 'Updated' }, user);
      expect(result.title).toBe('Updated');
    });

    it('throws when page does not exist', async () => {
      pageRepo.findById.mockResolvedValue(null);

      await expect(controller.update({ pageId: 'missing' }, user)).rejects.toThrow(
        new NotFoundException('Page not found'),
      );
    });

    it('validates page edit permission', async () => {
      const page = createMockPage();
      pageRepo.findById.mockResolvedValue(page);
      pageService.update.mockResolvedValue(page);

      await controller.update({ pageId: page.id, title: 'Updated' }, user);

      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(page, user);
    });

    it('converts updated content to markdown', async () => {
      const page = createMockPage();
      const updated = createMockPage({ title: 'Updated' });
      pageRepo.findById.mockResolvedValue(page);
      pageService.update.mockResolvedValue(updated);

      const result = await controller.update({ pageId: page.id, format: 'markdown' }, user);

      expect(jsonToMarkdown).toHaveBeenCalledWith(updated.content);
      expect(result.content).toBe('mock-markdown');
    });

    it('converts updated content to html', async () => {
      const page = createMockPage();
      const updated = createMockPage({ title: 'Updated' });
      pageRepo.findById.mockResolvedValue(page);
      pageService.update.mockResolvedValue(updated);

      const result = await controller.update({ pageId: page.id, format: 'html' }, user);

      expect(jsonToHtml).toHaveBeenCalledWith(updated.content);
      expect(result.content).toBe('<p>mock-html</p>');
    });
  });

  describe('POST /pages/delete', () => {
    it('soft deletes page and validates edit permission', async () => {
      const page = createMockPage({ id: 'page-a' });
      pageRepo.findById.mockResolvedValue(page);

      await controller.delete({ pageId: page.id, permanentlyDelete: false }, user, workspace);

      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(page, user);
      expect(pageService.removePage).toHaveBeenCalledWith(page.id, user.id, workspace.id);
      expect(pageService.forceDelete).not.toHaveBeenCalled();
    });

    it('permanently deletes page when user has manage settings permission', async () => {
      const page = createMockPage({ id: 'page-a' });
      const ability = createMockAbility({ can: true });
      pageRepo.findById.mockResolvedValue(page);
      spaceAbilityFactory.createForUser.mockResolvedValue(ability);

      await controller.delete({ pageId: page.id, permanentlyDelete: true }, user, workspace);

      expect(pageService.forceDelete).toHaveBeenCalledWith(page.id, workspace.id);
      expect(pageService.removePage).not.toHaveBeenCalled();
    });

    it('throws when page does not exist', async () => {
      pageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.delete({ pageId: 'missing', permanentlyDelete: false }, user, workspace),
      ).rejects.toThrow(new NotFoundException('Page not found'));
    });

    it('throws when permanent delete permission is denied', async () => {
      const page = createMockPage({ id: 'page-a' });
      const deniedAbility = createMockAbility({ can: true });
      deniedAbility.cannot.mockImplementation((action: string, subject: string) => {
        return action === SpaceCaslAction.Manage && subject === SpaceCaslSubject.Settings;
      });
      pageRepo.findById.mockResolvedValue(page);
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);

      await expect(
        controller.delete({ pageId: page.id, permanentlyDelete: true }, user, workspace),
      ).rejects.toThrow(new ForbiddenException('Only space admins can permanently delete pages'));
    });

    it('writes PAGE_TRASHED audit event for soft delete', async () => {
      const page = createMockPage({ id: 'page-a' });
      pageRepo.findById.mockResolvedValue(page);

      await controller.delete({ pageId: page.id, permanentlyDelete: false }, user, workspace);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.PAGE_TRASHED,
          resourceId: page.id,
        }),
      );
    });

    it('writes PAGE_DELETED audit event for permanent delete', async () => {
      const page = createMockPage({ id: 'page-a' });
      pageRepo.findById.mockResolvedValue(page);

      await controller.delete({ pageId: page.id, permanentlyDelete: true }, user, workspace);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.PAGE_DELETED,
          resourceId: page.id,
        }),
      );
    });
  });

  describe('POST /pages/restore', () => {
    it('restores page after space-level and page-level permission checks', async () => {
      const page = createMockPage({ id: 'page-a' });
      const restored = createMockPage({ id: 'page-a' });
      pageRepo.findById.mockResolvedValueOnce(page).mockResolvedValueOnce(restored);

      const result = await controller.restore({ pageId: page.id }, user, workspace);

      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, page.spaceId);
      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(page, user);
      expect(pageRepo.restorePage).toHaveBeenCalledWith(page.id, workspace.id);
      expect(result).toEqual(restored);
    });

    it('throws when page does not exist', async () => {
      pageRepo.findById.mockResolvedValue(null);

      await expect(controller.restore({ pageId: 'missing' }, user, workspace)).rejects.toThrow(
        new NotFoundException('Page not found'),
      );
    });

    it('throws when restore permission is denied at space level', async () => {
      const page = createMockPage({ id: 'page-a' });
      const deniedAbility = createMockAbility({ can: false });
      pageRepo.findById.mockResolvedValue(page);
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);

      await expect(controller.restore({ pageId: page.id }, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('writes PAGE_RESTORED audit log entry', async () => {
      const page = createMockPage({ id: 'page-a' });
      pageRepo.findById.mockResolvedValueOnce(page).mockResolvedValueOnce(page);

      await controller.restore({ pageId: page.id }, user, workspace);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.PAGE_RESTORED,
          resourceId: page.id,
          spaceId: page.spaceId,
        }),
      );
    });
  });

  describe('POST /pages/recent', () => {
    it('checks space read permission and returns recent space pages when spaceId is provided', async () => {
      const resultSet = createPaginationResult([createMockPage({ id: 'page-a' })]);
      const pagination = { limit: 20, query: '', adminView: false };
      pageService.getRecentSpacePages.mockResolvedValue(resultSet);

      const result = await controller.getRecentPages(
        { spaceId: 'space-a' },
        pagination,
        user,
      );

      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, 'space-a');
      expect(pageService.getRecentSpacePages).toHaveBeenCalledWith('space-a', user.id, pagination);
      expect(result).toEqual(resultSet);
    });

    it('returns recent pages without space filter when spaceId is missing', async () => {
      const resultSet = createPaginationResult([createMockPage({ id: 'page-a' })]);
      const pagination = { limit: 10, query: '', adminView: false };
      pageService.getRecentPages.mockResolvedValue(resultSet);

      const result = await controller.getRecentPages({ spaceId: '' }, pagination, user);

      expect(pageService.getRecentPages).toHaveBeenCalledWith(user.id, pagination);
      expect(pageService.getRecentSpacePages).not.toHaveBeenCalled();
      expect(result).toEqual(resultSet);
    });

    it('throws when space read permission is denied', async () => {
      const deniedAbility = createMockAbility({ can: false });
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);

      await expect(
        controller.getRecentPages(
          { spaceId: 'space-a' },
          { limit: 10, query: '', adminView: false },
          user,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /pages/trash', () => {
    it('checks space edit permission and returns deleted pages', async () => {
      const resultSet = createPaginationResult([createMockPage({ id: 'page-a' })]);
      const pagination = { limit: 10, query: '', adminView: false };
      pageService.getDeletedSpacePages.mockResolvedValue(resultSet);

      const result = await controller.getDeletedPages(
        { spaceId: 'space-a' },
        pagination,
        user,
      );

      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, 'space-a');
      expect(pageService.getDeletedSpacePages).toHaveBeenCalledWith('space-a', user.id, pagination);
      expect(result).toEqual(resultSet);
    });

    it('throws when space edit permission is denied', async () => {
      const deniedAbility = createMockAbility({ can: false });
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);

      await expect(
        controller.getDeletedPages(
          { spaceId: 'space-a' },
          { limit: 10, query: '', adminView: false },
          user,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /pages/history', () => {
    it('returns page history', async () => {
      const page = createMockPage({ id: 'page-a' });
      const historyItems = [createMockPageHistory({ pageId: page.id, id: 'h1' })];
      const resultSet = createPaginationResult(historyItems);
      pageRepo.findById.mockResolvedValue(page);
      pageHistoryService.findHistoryByPageId.mockResolvedValue(resultSet);

      const result = await controller.getPageHistory(
        { pageId: page.id },
        { limit: 10, query: '', adminView: false },
        user,
      );

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
      expect(pageHistoryService.findHistoryByPageId).toHaveBeenCalledWith(page.id, {
        limit: 10,
        query: '',
        adminView: false,
      });
      expect(result).toEqual(resultSet);
    });

    it('throws when page is not found', async () => {
      pageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.getPageHistory(
          { pageId: 'missing' },
          { limit: 10, query: '', adminView: false },
          user,
        ),
      ).rejects.toThrow(new NotFoundException('Page not found'));
    });

    it('propagates permission errors from page access service', async () => {
      const page = createMockPage({ id: 'page-a' });
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanView.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.getPageHistory(
          { pageId: page.id },
          { limit: 10, query: '', adminView: false },
          user,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /pages/history/info', () => {
    it('returns page history entry details', async () => {
      const page = createMockPage({ id: 'page-a' });
      const history = createMockPageHistory({ id: 'h1', pageId: page.id });
      pageHistoryService.findById.mockResolvedValue(history);
      pageRepo.findById.mockResolvedValue(page);

      const result = await controller.getPageHistoryInfo({ historyId: history.id }, user);

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
      expect(result).toEqual(history);
    });

    it('throws when history is not found', async () => {
      pageHistoryService.findById.mockResolvedValue(null);

      await expect(controller.getPageHistoryInfo({ historyId: 'missing' }, user)).rejects.toThrow(
        new NotFoundException('Page history not found'),
      );
    });

    it('throws when user cannot view source page', async () => {
      const page = createMockPage({ id: 'page-a' });
      const history = createMockPageHistory({ id: 'h1', pageId: page.id });
      pageHistoryService.findById.mockResolvedValue(history);
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanView.mockRejectedValue(new ForbiddenException());

      await expect(controller.getPageHistoryInfo({ historyId: history.id }, user)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('POST /pages/sidebar-pages', () => {
    it('returns sidebar pages when spaceId is provided', async () => {
      const pages = [createMockPage({ id: 'page-a' })];
      const resultSet = createPaginationResult(pages);
      pageService.getSidebarPages.mockResolvedValue(resultSet);

      const result = await controller.getSidebarPages(
        { spaceId: 'space-a', pageId: '' },
        { limit: 15, query: '', adminView: false },
        user,
      );

      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, 'space-a');
      expect(pageService.getSidebarPages).toHaveBeenCalledWith(
        'space-a',
        { limit: 15, query: '', adminView: false },
        '',
        user.id,
        true,
      );
      expect(result).toEqual(resultSet);
    });

    it('returns sidebar pages when pageId is provided', async () => {
      const page = createMockPage({ id: 'page-a', spaceId: 'space-a' });
      const resultSet = createPaginationResult([page]);
      pageRepo.findById.mockResolvedValue(page);
      pageService.getSidebarPages.mockResolvedValue(resultSet);

      const result = await controller.getSidebarPages(
        { pageId: page.id, spaceId: '' },
        { limit: 15, query: '', adminView: false },
        user,
      );

      expect(pageRepo.findById).toHaveBeenCalledWith(page.id);
      expect(pageService.getSidebarPages).toHaveBeenCalledWith(
        page.spaceId,
        { limit: 15, query: '', adminView: false },
        page.id,
        user.id,
        true,
      );
      expect(result).toEqual(resultSet);
    });

    it('throws bad request when both spaceId and pageId are missing', async () => {
      await expect(
        controller.getSidebarPages(
          { spaceId: '', pageId: '' },
          { limit: 15, query: '', adminView: false },
          user,
        ),
      ).rejects.toThrow(new BadRequestException('Either spaceId or pageId must be provided'));
    });

    it('throws forbidden when space read permission is denied', async () => {
      const deniedAbility = createMockAbility({ can: false });
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);

      await expect(
        controller.getSidebarPages(
          { spaceId: 'space-a', pageId: '' },
          { limit: 15, query: '', adminView: false },
          user,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /pages/move-to-space', () => {
    it('moves page to another space successfully', async () => {
      const page = createMockPage({ id: 'page-a', spaceId: 'space-a' });
      pageRepo.findById.mockResolvedValue(page);
      pageService.movePageToSpace.mockResolvedValue({ childPageIds: ['child-1'] });

      await controller.movePageToSpace({ pageId: page.id, spaceId: 'space-b' }, user);

      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(page, user);
      expect(pageService.movePageToSpace).toHaveBeenCalledWith(page, 'space-b', user.id);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.PAGE_MOVED_TO_SPACE,
          resourceId: page.id,
        }),
      );
    });

    it('throws when page is not found', async () => {
      pageRepo.findById.mockResolvedValue(null);

      await expect(controller.movePageToSpace({ pageId: 'missing', spaceId: 'space-b' }, user)).rejects.toThrow(
        new NotFoundException('Page to move not found'),
      );
    });

    it('throws bad request when source and target spaces are same', async () => {
      const page = createMockPage({ id: 'page-a', spaceId: 'space-a' });
      pageRepo.findById.mockResolvedValue(page);

      await expect(controller.movePageToSpace({ pageId: page.id, spaceId: page.spaceId }, user)).rejects.toThrow(
        new BadRequestException('Page is already in this space'),
      );
    });

    it('throws forbidden when edit permissions are denied in either space', async () => {
      const page = createMockPage({ id: 'page-a', spaceId: 'space-a' });
      const deniedAbility = createMockAbility({ can: false });
      pageRepo.findById.mockResolvedValue(page);
      spaceAbilityFactory.createForUser
        .mockResolvedValueOnce(createMockAbility({ can: true }))
        .mockResolvedValueOnce(deniedAbility);

      await expect(controller.movePageToSpace({ pageId: page.id, spaceId: 'space-b' }, user)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('POST /pages/duplicate', () => {
    it('duplicates page in same space', async () => {
      const page = createMockPage({ id: 'page-a', spaceId: 'space-a' });
      const duplicated = { id: 'dup-1', childPageIds: [] };
      pageRepo.findById.mockResolvedValue(page);
      pageService.duplicatePage.mockResolvedValue(duplicated);

      const result = await controller.duplicatePage({ pageId: page.id }, user);

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
      expect(pageService.duplicatePage).toHaveBeenCalledWith(page, undefined, user);
      expect(result).toEqual(duplicated);
    });

    it('duplicates page across spaces', async () => {
      const page = createMockPage({ id: 'page-a', spaceId: 'space-a' });
      const duplicated = { id: 'dup-1', childPageIds: ['child-1'] };
      pageRepo.findById.mockResolvedValue(page);
      pageService.duplicatePage.mockResolvedValue(duplicated);

      const result = await controller.duplicatePage({ pageId: page.id, spaceId: 'space-b' }, user);

      expect(pageService.duplicatePage).toHaveBeenCalledWith(page, 'space-b', user);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.PAGE_DUPLICATED,
          resourceId: duplicated.id,
          spaceId: 'space-b',
        }),
      );
      expect(result).toEqual(duplicated);
    });

    it('throws when source page is not found', async () => {
      pageRepo.findById.mockResolvedValue(null);

      await expect(controller.duplicatePage({ pageId: 'missing' }, user)).rejects.toThrow(
        new NotFoundException('Page to copy not found'),
      );
    });

    it('throws forbidden when duplicate permissions are denied', async () => {
      const page = createMockPage({ id: 'page-a', spaceId: 'space-a' });
      const deniedAbility = createMockAbility({ can: false });
      pageRepo.findById.mockResolvedValue(page);
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);

      await expect(controller.duplicatePage({ pageId: page.id }, user)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('POST /pages/move', () => {
    it('moves page successfully', async () => {
      const page = createMockPage({ id: 'page-a', parentPageId: null });
      const moveResult = { id: 'page-a' };
      pageRepo.findById.mockResolvedValue(page);
      pageService.movePage.mockResolvedValue(moveResult);

      const result = await controller.movePage(
        { pageId: page.id, parentPageId: null, position: '0|aaaaaa:' },
        user,
      );

      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(page, user);
      expect(pageService.movePage).toHaveBeenCalledWith(
        { pageId: page.id, parentPageId: null, position: '0|aaaaaa:' },
        page,
      );
      expect(result).toEqual(moveResult);
    });

    it('throws when moved page is not found', async () => {
      pageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.movePage({ pageId: 'missing', position: '0|aaaaaa:' }, user),
      ).rejects.toThrow(new NotFoundException('Moved page not found'));
    });

    it('throws forbidden when edit permission is denied', async () => {
      const page = createMockPage({ id: 'page-a' });
      const deniedAbility = createMockAbility({ can: false });
      pageRepo.findById.mockResolvedValue(page);
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);

      await expect(
        controller.movePage({ pageId: page.id, position: '0|aaaaaa:' }, user),
      ).rejects.toThrow(ForbiddenException);
    });

    it('validates new parent edit permission when parent changes', async () => {
      const page = createMockPage({ id: 'page-a', parentPageId: 'parent-old' });
      const targetParent = createMockPage({ id: 'parent-new', deletedAt: null });
      pageRepo.findById.mockResolvedValueOnce(page).mockResolvedValueOnce(targetParent);
      pageService.movePage.mockResolvedValue({ id: page.id });

      await controller.movePage(
        { pageId: page.id, parentPageId: targetParent.id, position: '0|aaaaaa:' },
        user,
      );

      expect(pageAccessService.validateCanEdit).toHaveBeenNthCalledWith(1, page, user);
      expect(pageAccessService.validateCanEdit).toHaveBeenNthCalledWith(2, targetParent, user);
    });
  });

  describe('POST /pages/breadcrumbs', () => {
    it('returns page breadcrumbs', async () => {
      const page = createMockPage({ id: 'page-a' });
      const breadcrumbs = [
        { id: 'root', title: 'Root' },
        { id: 'page-a', title: 'Page A' },
      ];
      pageRepo.findById.mockResolvedValue(page);
      pageService.getPageBreadCrumbs.mockResolvedValue(breadcrumbs);

      const result = await controller.getPageBreadcrumbs({ pageId: page.id }, user);

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
      expect(pageService.getPageBreadCrumbs).toHaveBeenCalledWith(page.id);
      expect(result).toEqual(breadcrumbs);
    });

    it('throws when page is not found', async () => {
      pageRepo.findById.mockResolvedValue(null);

      await expect(controller.getPageBreadcrumbs({ pageId: 'missing' }, user)).rejects.toThrow(
        new NotFoundException('Page not found'),
      );
    });

    it('propagates permission errors from page access service', async () => {
      const page = createMockPage({ id: 'page-a' });
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanView.mockRejectedValue(new ForbiddenException());

      await expect(controller.getPageBreadcrumbs({ pageId: page.id }, user)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
