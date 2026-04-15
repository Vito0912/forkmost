jest.mock('../../collaboration/collaboration.util', () => ({
  jsonToHtml: jest.fn().mockReturnValue('<p>html</p>'),
  jsonToMarkdown: jest.fn().mockReturnValue('# markdown'),
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { findHighestUserSpaceRole } from '@docmost/db/repos/space/utils';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PageAccessService } from '../page/page-access/page-access.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { SpaceRole } from '../../common/helpers/types/permission';
import { SharePasswordRequiredException } from './exceptions/share-password-required.exception';
import {
  comparePasswordHash,
  hasLicenseOrEE,
} from '../../common/helpers';
import {
  createMockAbility,
  createMockAuditService,
  createMockPage,
  createMockShare,
  createMockSpaceAbilityFactory,
  createMockUser,
  createMockWorkspace,
  createPaginationResult,
} from '../../test-utils/test-helpers';

jest.mock('../../common/helpers', () => ({
  comparePasswordHash: jest.fn(),
  hasLicenseOrEE: jest.fn(),
}));

jest.mock('@docmost/db/repos/space/utils', () => ({
  findHighestUserSpaceRole: jest.fn(),
}));

describe('ShareController', () => {
  let controller: ShareController;

  let shareService: {
    getSharedPage: jest.Mock;
    isSharingAllowed: jest.Mock;
    getShareForPage: jest.Mock;
    createShare: jest.Mock;
    updateShare: jest.Mock;
    getShareTree: jest.Mock;
    setSharePassword: jest.Mock;
    removeSharePassword: jest.Mock;
  };
  let shareRepo: {
    findById: jest.Mock;
    getShares: jest.Mock;
    deleteShare: jest.Mock;
  };
  let pageRepo: {
    findById: jest.Mock;
  };
  let pagePermissionRepo: {
    hasRestrictedAncestor: jest.Mock;
  };
  let pageAccessService: {
    validateCanView: jest.Mock;
    validateCanEdit: jest.Mock;
  };
  let environmentService: {
    isCloud: jest.Mock;
  };
  let spaceMemberRepo: {
    getUserSpaceRoles: jest.Mock;
  };
  let spaceAbilityFactory: {
    createForUser: jest.Mock;
  };
  let auditService: IAuditService;

  const mockedComparePasswordHash = comparePasswordHash as jest.Mock;
  const mockedHasLicenseOrEE = hasLicenseOrEE as jest.Mock;
  const mockedFindHighestUserSpaceRole = findHighestUserSpaceRole as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    shareService = {
      getSharedPage: jest.fn(),
      isSharingAllowed: jest.fn(),
      getShareForPage: jest.fn(),
      createShare: jest.fn(),
      updateShare: jest.fn(),
      getShareTree: jest.fn(),
      setSharePassword: jest.fn(),
      removeSharePassword: jest.fn(),
    };
    shareRepo = {
      findById: jest.fn(),
      getShares: jest.fn(),
      deleteShare: jest.fn(),
    };
    pageRepo = {
      findById: jest.fn(),
    };
    pagePermissionRepo = {
      hasRestrictedAncestor: jest.fn(),
    };
    pageAccessService = {
      validateCanView: jest.fn(),
      validateCanEdit: jest.fn(),
    };
    environmentService = {
      isCloud: jest.fn().mockReturnValue(false),
    };
    spaceMemberRepo = {
      getUserSpaceRoles: jest.fn(),
    };
    spaceAbilityFactory = createMockSpaceAbilityFactory(createMockAbility()) as {
      createForUser: jest.Mock;
    };
    auditService = createMockAuditService();

    mockedHasLicenseOrEE.mockReturnValue(false);
    mockedFindHighestUserSpaceRole.mockReturnValue(SpaceRole.ADMIN);

    const moduleBuilder = Test.createTestingModule({
      controllers: [ShareController],
      providers: [
        { provide: ShareService, useValue: shareService },
        { provide: ShareRepo, useValue: shareRepo },
        { provide: PageRepo, useValue: pageRepo },
        { provide: PagePermissionRepo, useValue: pagePermissionRepo },
        { provide: PageAccessService, useValue: pageAccessService },
        { provide: EnvironmentService, useValue: environmentService },
        { provide: SpaceMemberRepo, useValue: spaceMemberRepo },
        { provide: SpaceAbilityFactory, useValue: spaceAbilityFactory },
        { provide: AUDIT_SERVICE, useValue: auditService },
      ],
    });

    const module: TestingModule = await moduleBuilder.compile();
    controller = module.get<ShareController>(ShareController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getShares', () => {
    it('returns paginated shares for the user', async () => {
      const user = createMockUser();
      const pagination = {
        limit: 10,
        cursor: 'cursor-1',
        query: '',
        adminView: false,
      };
      const shares = [createMockShare(), createMockShare({ id: 'share-id-2' })];
      const result = createPaginationResult(shares, { limit: 10 });

      shareRepo.getShares.mockResolvedValue(result);

      await expect(controller.getShares(user, pagination)).resolves.toEqual(result);
      expect(shareRepo.getShares).toHaveBeenCalledWith(user.id, pagination);
    });

    it('returns empty pagination result when no shares exist', async () => {
      const user = createMockUser();
      const pagination = { limit: 25, cursor: null, query: '', adminView: false };
      const result = createPaginationResult([], { limit: 25 });

      shareRepo.getShares.mockResolvedValue(result);

      await expect(controller.getShares(user, pagination)).resolves.toEqual(result);
    });

    it('passes pagination options unchanged to repository', async () => {
      const user = createMockUser();
      const pagination = {
        limit: 50,
        beforeCursor: 'prev-1',
        query: 'spec',
        adminView: false,
      };

      shareRepo.getShares.mockResolvedValue(createPaginationResult([]));

      await controller.getShares(user, pagination);

      expect(shareRepo.getShares).toHaveBeenCalledWith(user.id, pagination);
    });
  });

  describe('getSharedPageInfo', () => {
    it('returns shared page info with license flag', async () => {
      const workspace = createMockWorkspace({
        licenseKey: 'license-key',
        plan: 'business',
      });
      const share = createMockShare();
      const page = createMockPage();
      const dto = { pageId: page.id, password: 'secret' };
      const shareData = { page, share };

      shareService.getSharedPage.mockResolvedValue(shareData);
      shareService.isSharingAllowed.mockResolvedValue(true);
      environmentService.isCloud.mockReturnValue(true);
      mockedHasLicenseOrEE.mockReturnValue(true);

      await expect(controller.getSharedPageInfo(dto, workspace)).resolves.toEqual({
        ...shareData,
        hasLicenseKey: true,
      });
      expect(shareService.getSharedPage).toHaveBeenCalledWith(dto, workspace.id);
      expect(shareService.isSharingAllowed).toHaveBeenCalledWith(
        workspace.id,
        share.spaceId,
      );
      expect(mockedHasLicenseOrEE).toHaveBeenCalledWith({
        licenseKey: workspace.licenseKey,
        isCloud: true,
        plan: workspace.plan,
      });
    });

    it('throws BadRequestException when pageId and shareId are both missing', async () => {
      const workspace = createMockWorkspace();

      await expect(
        controller.getSharedPageInfo({ pageId: '', shareId: '' }, workspace),
      ).rejects.toThrow(BadRequestException);
      expect(shareService.getSharedPage).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when sharing is disabled for page info', async () => {
      const workspace = createMockWorkspace();
      const share = createMockShare();
      const dto = { pageId: 'page-id-1' };

      shareService.getSharedPage.mockResolvedValue({ page: createMockPage(), share });
      shareService.isSharingAllowed.mockResolvedValue(false);

      await expect(controller.getSharedPageInfo(dto, workspace)).rejects.toThrow(
        new NotFoundException('Shared page not found'),
      );
    });

    it('allows lookup by shareId without pageId', async () => {
      const workspace = createMockWorkspace();
      const share = createMockShare({ id: 'share-id-by-key' });
      const dto = { shareId: share.id, pageId: '', password: 'pw' };

      shareService.getSharedPage.mockResolvedValue({ page: createMockPage(), share });
      shareService.isSharingAllowed.mockResolvedValue(true);
      mockedHasLicenseOrEE.mockReturnValue(false);

      await controller.getSharedPageInfo(dto, workspace);

      expect(shareService.getSharedPage).toHaveBeenCalledWith(dto, workspace.id);
      expect(mockedHasLicenseOrEE).toHaveBeenCalledTimes(1);
    });
  });

  describe('getShare', () => {
    it('returns share when found, allowed, and without password', async () => {
      const share = createMockShare({ passwordHash: null });
      const dto = { shareId: share.id };

      shareRepo.findById.mockResolvedValue(share);
      shareService.isSharingAllowed.mockResolvedValue(true);

      await expect(controller.getShare(dto)).resolves.toEqual(share);
      expect(shareRepo.findById).toHaveBeenCalledWith(dto.shareId, {
        includeSharedPage: true,
      });
      expect(mockedComparePasswordHash).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when share is missing', async () => {
      shareRepo.findById.mockResolvedValue(null);

      await expect(controller.getShare({ shareId: 'missing-share' })).rejects.toThrow(
        new NotFoundException('Share not found'),
      );
      expect(shareService.isSharingAllowed).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when sharing is disabled for share info', async () => {
      const share = createMockShare();

      shareRepo.findById.mockResolvedValue(share);
      shareService.isSharingAllowed.mockResolvedValue(false);

      await expect(controller.getShare({ shareId: share.id })).rejects.toThrow(
        new NotFoundException('Share not found'),
      );
    });

    it('throws SharePasswordRequiredException when password is required but missing', async () => {
      const share = createMockShare({ passwordHash: 'hash-1' });

      shareRepo.findById.mockResolvedValue(share);
      shareService.isSharingAllowed.mockResolvedValue(true);

      await expect(controller.getShare({ shareId: share.id })).rejects.toThrow(
        new SharePasswordRequiredException(share.key),
      );
      expect(mockedComparePasswordHash).not.toHaveBeenCalled();
    });

    it('throws SharePasswordRequiredException when provided password is incorrect', async () => {
      const share = createMockShare({ passwordHash: 'hash-1' });

      shareRepo.findById.mockResolvedValue(share);
      shareService.isSharingAllowed.mockResolvedValue(true);
      mockedComparePasswordHash.mockResolvedValue(false);

      await expect(
        controller.getShare({ shareId: share.id, password: 'wrong' }),
      ).rejects.toThrow(new SharePasswordRequiredException(share.key));
      expect(mockedComparePasswordHash).toHaveBeenCalledWith('wrong', 'hash-1');
    });

    it('returns share when password validation succeeds', async () => {
      const share = createMockShare({ passwordHash: 'hash-2' });

      shareRepo.findById.mockResolvedValue(share);
      shareService.isSharingAllowed.mockResolvedValue(true);
      mockedComparePasswordHash.mockResolvedValue(true);

      await expect(
        controller.getShare({ shareId: share.id, password: 'correct' }),
      ).resolves.toEqual(share);
    });
  });

  describe('getShareForPage', () => {
    it('returns share for page when page exists and user can view', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const page = createMockPage();
      const dto = { pageId: page.id };
      const share = createMockShare({ pageId: page.id, workspaceId: workspace.id });

      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanView.mockResolvedValue(undefined);
      shareService.getShareForPage.mockResolvedValue(share);

      await expect(controller.getShareForPage(dto, user, workspace)).resolves.toEqual(
        share,
      );
      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
      expect(shareService.getShareForPage).toHaveBeenCalledWith(page.id, workspace.id);
    });

    it('throws NotFoundException when page for share lookup does not exist', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();

      pageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.getShareForPage({ pageId: 'missing-page' }, user, workspace),
      ).rejects.toThrow(new NotFoundException('Shared page not found'));
      expect(pageAccessService.validateCanView).not.toHaveBeenCalled();
    });

    it('validates view permission before getting share for page', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const page = createMockPage();

      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanView.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.getShareForPage({ pageId: page.id }, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(shareService.getShareForPage).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates share and logs audit event when all checks pass', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const page = createMockPage({ workspaceId: workspace.id });
      const dto = {
        pageId: page.id,
        includeSubPages: true,
        searchIndexing: true,
        password: 'secret',
      };
      const share = createMockShare({ pageId: page.id, spaceId: page.spaceId });

      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanEdit.mockResolvedValue(undefined);
      pagePermissionRepo.hasRestrictedAncestor.mockResolvedValue(false);
      shareService.isSharingAllowed.mockResolvedValue(true);
      shareService.createShare.mockResolvedValue(share);

      await expect(controller.create(dto, user, workspace)).resolves.toEqual(share);
      expect(shareService.createShare).toHaveBeenCalledWith({
        page,
        authUserId: user.id,
        workspaceId: workspace.id,
        createShareDto: dto,
      });
      expect((auditService.log as jest.Mock).mock.calls[0][0]).toMatchObject({
        resourceId: share.id,
        spaceId: page.spaceId,
        metadata: {
          pageId: page.id,
          spaceId: page.spaceId,
        },
      });
    });

    it('throws NotFoundException when page does not exist', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();

      pageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.create(
          { pageId: 'missing-page', includeSubPages: false, searchIndexing: false },
          user,
          workspace,
        ),
      ).rejects.toThrow(new NotFoundException('Page not found'));
      expect(pageAccessService.validateCanEdit).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when page belongs to another workspace', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace({ id: 'workspace-a' });
      const page = createMockPage({ workspaceId: 'workspace-b' });

      pageRepo.findById.mockResolvedValue(page);

      await expect(
        controller.create(
          { pageId: page.id, includeSubPages: false, searchIndexing: false },
          user,
          workspace,
        ),
      ).rejects.toThrow(new NotFoundException('Page not found'));
    });

    it('validates edit permission before creating share', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const page = createMockPage({ workspaceId: workspace.id });

      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.create(
          { pageId: page.id, includeSubPages: false, searchIndexing: false },
          user,
          workspace,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(pagePermissionRepo.hasRestrictedAncestor).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when page has restricted ancestor', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const page = createMockPage({ workspaceId: workspace.id });

      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanEdit.mockResolvedValue(undefined);
      pagePermissionRepo.hasRestrictedAncestor.mockResolvedValue(true);

      await expect(
        controller.create(
          { pageId: page.id, includeSubPages: false, searchIndexing: false },
          user,
          workspace,
        ),
      ).rejects.toThrow(new BadRequestException('Cannot share a restricted page'));
      expect(shareService.isSharingAllowed).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when sharing is disabled', async () => {
      const user = createMockUser();
      const workspace = createMockWorkspace();
      const page = createMockPage({ workspaceId: workspace.id });

      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanEdit.mockResolvedValue(undefined);
      pagePermissionRepo.hasRestrictedAncestor.mockResolvedValue(false);
      shareService.isSharingAllowed.mockResolvedValue(false);

      await expect(
        controller.create(
          { pageId: page.id, includeSubPages: false, searchIndexing: false },
          user,
          workspace,
        ),
      ).rejects.toThrow(new ForbiddenException('Public sharing is disabled'));
      expect(shareService.createShare).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates share when share exists and user can edit page', async () => {
      const user = createMockUser();
      const share = createMockShare();
      const page = createMockPage({ id: share.pageId });
      const dto = {
        shareId: share.id,
        pageId: share.pageId,
        includeSubPages: true,
        searchIndexing: false,
      };
      const updated = createMockShare({
        id: share.id,
        includeChildPages: true,
      });

      shareRepo.findById.mockResolvedValue(share);
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanEdit.mockResolvedValue(undefined);
      shareService.updateShare.mockResolvedValue(updated);

      await expect(controller.update(dto, user)).resolves.toEqual(updated);
      expect(shareService.updateShare).toHaveBeenCalledWith(share.id, dto);
    });

    it('throws NotFoundException when share to update is missing', async () => {
      const user = createMockUser();

      shareRepo.findById.mockResolvedValue(null);

      await expect(
        controller.update(
          {
            shareId: 'missing-share',
            pageId: 'page-id-1',
            includeSubPages: false,
            searchIndexing: false,
          },
          user,
        ),
      ).rejects.toThrow(new NotFoundException('Share not found'));
      expect(pageRepo.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when page for share update is missing', async () => {
      const user = createMockUser();
      const share = createMockShare();

      shareRepo.findById.mockResolvedValue(share);
      pageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.update(
          {
            shareId: share.id,
            pageId: share.pageId,
            includeSubPages: false,
            searchIndexing: false,
          },
          user,
        ),
      ).rejects.toThrow(new NotFoundException('Page not found'));
      expect(pageAccessService.validateCanEdit).not.toHaveBeenCalled();
    });

    it('validates edit permission before updating share', async () => {
      const user = createMockUser();
      const share = createMockShare();
      const page = createMockPage({ id: share.pageId });

      shareRepo.findById.mockResolvedValue(share);
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.update(
          {
            shareId: share.id,
            pageId: share.pageId,
            includeSubPages: false,
            searchIndexing: false,
          },
          user,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(shareService.updateShare).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes share and logs audit event when authorized', async () => {
      const user = createMockUser();
      const share = createMockShare();
      const page = createMockPage({ id: share.pageId });

      shareRepo.findById.mockResolvedValue(share);
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanEdit.mockResolvedValue(undefined);
      shareRepo.deleteShare.mockResolvedValue(undefined);

      await expect(controller.delete({ shareId: share.id }, user)).resolves.toBeUndefined();
      expect(shareRepo.deleteShare).toHaveBeenCalledWith(share.id);
      expect((auditService.log as jest.Mock).mock.calls[0][0]).toMatchObject({
        resourceId: share.id,
        spaceId: share.spaceId,
        changes: {
          before: {
            pageId: share.pageId,
            spaceId: share.spaceId,
          },
        },
      });
    });

    it('throws NotFoundException when share to delete is missing', async () => {
      const user = createMockUser();

      shareRepo.findById.mockResolvedValue(null);

      await expect(
        controller.delete({ shareId: 'missing-share' }, user),
      ).rejects.toThrow(new NotFoundException('Share not found'));
      expect(pageRepo.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when page for share delete is missing', async () => {
      const user = createMockUser();
      const share = createMockShare();

      shareRepo.findById.mockResolvedValue(share);
      pageRepo.findById.mockResolvedValue(null);

      await expect(controller.delete({ shareId: share.id }, user)).rejects.toThrow(
        new NotFoundException('Page not found'),
      );
      expect(pageAccessService.validateCanEdit).not.toHaveBeenCalled();
    });

    it('validates edit permission before deleting share', async () => {
      const user = createMockUser();
      const share = createMockShare();
      const page = createMockPage({ id: share.pageId });

      shareRepo.findById.mockResolvedValue(share);
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      await expect(controller.delete({ shareId: share.id }, user)).rejects.toThrow(
        ForbiddenException,
      );
      expect(shareRepo.deleteShare).not.toHaveBeenCalled();
    });
  });

  describe('getSharePageTree', () => {
    it('returns share tree with license flag when sharing is allowed', async () => {
      const workspace = createMockWorkspace({
        licenseKey: 'key-1',
        plan: 'business',
      });
      const share = createMockShare();
      const treeData = {
        share,
        pageTree: [createMockPage(), createMockPage({ id: 'page-id-2' })],
      };

      shareService.getShareTree.mockResolvedValue(treeData);
      shareService.isSharingAllowed.mockResolvedValue(true);
      environmentService.isCloud.mockReturnValue(true);
      mockedHasLicenseOrEE.mockReturnValue(true);

      await expect(
        controller.getSharePageTree({ shareId: share.id }, workspace),
      ).resolves.toEqual({
        ...treeData,
        hasLicenseKey: true,
      });
      expect(shareService.getShareTree).toHaveBeenCalledWith(share.id, workspace.id);
      expect(shareService.isSharingAllowed).toHaveBeenCalledWith(
        workspace.id,
        share.spaceId,
      );
    });

    it('throws NotFoundException when sharing is disabled for tree endpoint', async () => {
      const workspace = createMockWorkspace();
      const share = createMockShare();
      const treeData = {
        share,
        pageTree: [createMockPage()],
      };

      shareService.getShareTree.mockResolvedValue(treeData);
      shareService.isSharingAllowed.mockResolvedValue(false);

      await expect(
        controller.getSharePageTree({ shareId: share.id }, workspace),
      ).rejects.toThrow(new NotFoundException('Share not found'));
    });

    it('passes workspace context into share tree lookup', async () => {
      const workspace = createMockWorkspace({ id: 'workspace-custom' });
      const share = createMockShare({ id: 'share-custom' });

      shareService.getShareTree.mockResolvedValue({ share, pageTree: [] });
      shareService.isSharingAllowed.mockResolvedValue(true);

      await controller.getSharePageTree({ shareId: share.id }, workspace);

      expect(shareService.getShareTree).toHaveBeenCalledWith(share.id, workspace.id);
      expect(shareService.isSharingAllowed).toHaveBeenCalledWith(
        workspace.id,
        share.spaceId,
      );
    });
  });

  describe('setPassword', () => {
    it('sets password when share exists and user can edit share', async () => {
      const user = createMockUser();
      const share = createMockShare();
      const dto = { shareId: share.id, password: 'new-password' };
      const ability = createMockAbility();

      shareRepo.findById.mockResolvedValue(share);
      spaceAbilityFactory.createForUser.mockResolvedValue(ability);
      shareService.setSharePassword.mockResolvedValue(undefined);

      await expect(controller.setPassword(dto, user)).resolves.toBeUndefined();
      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(
        user,
        share.spaceId,
      );
      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Edit,
        SpaceCaslSubject.Share,
      );
      expect(shareService.setSharePassword).toHaveBeenCalledWith(
        dto.shareId,
        dto.password,
      );
    });

    it('throws NotFoundException when share for set-password is missing', async () => {
      const user = createMockUser();

      shareRepo.findById.mockResolvedValue(null);

      await expect(
        controller.setPassword({ shareId: 'missing', password: 'pw' }, user),
      ).rejects.toThrow(new NotFoundException('Share not found'));
      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when user cannot edit share', async () => {
      const user = createMockUser();
      const share = createMockShare();
      const deniedAbility = createMockAbility({ can: false });

      shareRepo.findById.mockResolvedValue(share);
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);

      await expect(
        controller.setPassword({ shareId: share.id, password: 'pw' }, user),
      ).rejects.toThrow(ForbiddenException);
      expect(shareService.setSharePassword).not.toHaveBeenCalled();
    });
  });

  describe('removePassword', () => {
    it('removes password when user has admin role in space', async () => {
      const user = createMockUser();
      const share = createMockShare();
      const roles = [SpaceRole.WRITER, SpaceRole.ADMIN];

      shareRepo.findById.mockResolvedValue(share);
      spaceMemberRepo.getUserSpaceRoles.mockResolvedValue(roles);
      mockedFindHighestUserSpaceRole.mockReturnValue(SpaceRole.ADMIN);
      shareService.removeSharePassword.mockResolvedValue(undefined);

      await expect(
        controller.removePassword({ shareId: share.id }, user),
      ).resolves.toBeUndefined();
      expect(spaceMemberRepo.getUserSpaceRoles).toHaveBeenCalledWith(
        user.id,
        share.spaceId,
      );
      expect(mockedFindHighestUserSpaceRole).toHaveBeenCalledWith(roles);
      expect(shareService.removeSharePassword).toHaveBeenCalledWith(share.id);
    });

    it('throws NotFoundException when share for remove-password is missing', async () => {
      const user = createMockUser();

      shareRepo.findById.mockResolvedValue(null);

      await expect(controller.removePassword({ shareId: 'missing' }, user)).rejects.toThrow(
        new NotFoundException('Share not found'),
      );
      expect(spaceMemberRepo.getUserSpaceRoles).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when user role is not admin', async () => {
      const user = createMockUser();
      const share = createMockShare();

      shareRepo.findById.mockResolvedValue(share);
      spaceMemberRepo.getUserSpaceRoles.mockResolvedValue([SpaceRole.WRITER]);
      mockedFindHighestUserSpaceRole.mockReturnValue(SpaceRole.WRITER);

      await expect(
        controller.removePassword({ shareId: share.id }, user),
      ).rejects.toThrow(ForbiddenException);
      expect(shareService.removeSharePassword).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when no role resolves to admin', async () => {
      const user = createMockUser();
      const share = createMockShare();

      shareRepo.findById.mockResolvedValue(share);
      spaceMemberRepo.getUserSpaceRoles.mockResolvedValue([]);
      mockedFindHighestUserSpaceRole.mockReturnValue(undefined);

      await expect(
        controller.removePassword({ shareId: share.id }, user),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
