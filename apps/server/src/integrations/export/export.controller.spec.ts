import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import {
  createMockAbility,
  createMockAuditService,
  createMockFastifyReply,
  createMockPage,
  createMockSpaceAbilityFactory,
  createMockUser,
} from '../../test-utils/test-helpers';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { AUDIT_SERVICE } from '../audit/audit.service';
import { ExportController } from './export.controller';
import { ExportFormat } from './dto/export-dto';
import { ExportService } from './export.service';

jest.mock('./export.service', () => ({
  ExportService: class ExportService {},
}));

jest.mock('../../common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

describe('ExportController', () => {
  let controller: ExportController;
  let exportService: {
    exportPages: jest.Mock;
    exportSpace: jest.Mock;
  };
  let pageRepo: { findById: jest.Mock };
  let spaceAbilityFactory: { createForUser: jest.Mock };
  let pageAccessService: { validateCanView: jest.Mock };
  let auditService: { log: jest.Mock };

  const user = createMockUser({ id: 'user-export-1' });

  beforeEach(async () => {
    exportService = {
      exportPages: jest.fn(),
      exportSpace: jest.fn(),
    };

    pageRepo = {
      findById: jest.fn(),
    };

    spaceAbilityFactory = createMockSpaceAbilityFactory(createMockAbility()) as {
      createForUser: jest.Mock;
    };

    pageAccessService = {
      validateCanView: jest.fn().mockResolvedValue(undefined),
    };

    auditService = createMockAuditService() as { log: jest.Mock };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExportController],
      providers: [
        { provide: ExportService, useValue: exportService },
        { provide: PageRepo, useValue: pageRepo },
        { provide: SpaceAbilityFactory, useValue: spaceAbilityFactory },
        { provide: PageAccessService, useValue: pageAccessService },
        { provide: AUDIT_SERVICE, useValue: auditService },
      ],
    }).compile();

    controller = module.get<ExportController>(ExportController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /pages/export', () => {
    it('exports a page successfully and sends stream response', async () => {
      const page = createMockPage({ id: 'page-1', spaceId: 'space-1', title: 'Roadmap' });
      const zipFileStream = { pipe: jest.fn() };
      const reply = createMockFastifyReply();
      const dto = {
        pageId: page.id,
        format: ExportFormat.Markdown,
        includeAttachments: true,
        includeChildren: false,
      };

      pageRepo.findById.mockResolvedValue(page);
      exportService.exportPages.mockResolvedValue(zipFileStream);

      await controller.exportPage(dto, user, reply);

      expect(pageRepo.findById).toHaveBeenCalledWith(page.id, {
        includeContent: true,
      });
      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
      expect(exportService.exportPages).toHaveBeenCalledWith(
        page.id,
        dto.format,
        dto.includeAttachments,
        dto.includeChildren,
        user.id,
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.PAGE_EXPORTED,
          resourceType: AuditResource.PAGE,
          resourceId: page.id,
          spaceId: page.spaceId,
        }),
      );
      expect(reply.headers).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/zip',
        }),
      );
      expect(reply.send).toHaveBeenCalledWith(zipFileStream);
    });

    it('throws NotFoundException when page does not exist', async () => {
      pageRepo.findById.mockResolvedValue(null);
      const reply = createMockFastifyReply();

      await expect(
        controller.exportPage(
          {
            pageId: 'missing-page',
            format: ExportFormat.HTML,
            includeAttachments: false,
            includeChildren: false,
          },
          user,
          reply,
        ),
      ).rejects.toThrow(new NotFoundException('Page not found'));
      expect(exportService.exportPages).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when page is deleted', async () => {
      pageRepo.findById.mockResolvedValue(createMockPage({ deletedAt: new Date().toISOString() }));
      const reply = createMockFastifyReply();

      await expect(
        controller.exportPage(
          {
            pageId: 'page-deleted',
            format: ExportFormat.HTML,
            includeAttachments: false,
            includeChildren: false,
          },
          user,
          reply,
        ),
      ).rejects.toThrow(new NotFoundException('Page not found'));
    });

    it('propagates view permission errors', async () => {
      const page = createMockPage({ id: 'page-denied' });
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanView.mockRejectedValue(
        new ForbiddenException('cannot view page'),
      );
      const reply = createMockFastifyReply();

      await expect(
        controller.exportPage(
          {
            pageId: page.id,
            format: ExportFormat.HTML,
            includeAttachments: true,
            includeChildren: true,
          },
          user,
          reply,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(exportService.exportPages).not.toHaveBeenCalled();
    });

    it('passes includeChildren and includeAttachments values to export service', async () => {
      const page = createMockPage({ id: 'page-flags' });
      const reply = createMockFastifyReply();
      const zipFileStream = { pipe: jest.fn() };

      pageRepo.findById.mockResolvedValue(page);
      exportService.exportPages.mockResolvedValue(zipFileStream);

      await controller.exportPage(
        {
          pageId: page.id,
          format: ExportFormat.Markdown,
          includeAttachments: false,
          includeChildren: true,
        },
        user,
        reply,
      );

      expect(exportService.exportPages).toHaveBeenCalledWith(
        page.id,
        ExportFormat.Markdown,
        false,
        true,
        user.id,
      );
    });
  });

  describe('POST /spaces/export', () => {
    it('exports a space successfully when user has settings permission', async () => {
      const reply = createMockFastifyReply();
      const dto = {
        spaceId: 'space-1',
        format: ExportFormat.HTML,
        includeAttachments: true,
      };
      const exportFile = {
        fileStream: { pipe: jest.fn() },
        fileName: 'Engineering Space.zip',
        spaceName: 'Engineering Space',
      };

      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility({ can: true }));
      exportService.exportSpace.mockResolvedValue(exportFile);

      await controller.exportSpace(dto, user, reply);

      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, dto.spaceId);
      expect(exportService.exportSpace).toHaveBeenCalledWith(
        dto.spaceId,
        dto.format,
        dto.includeAttachments,
        user.id,
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.SPACE_EXPORTED,
          resourceType: AuditResource.SPACE,
          resourceId: dto.spaceId,
          spaceId: dto.spaceId,
        }),
      );
      expect(reply.headers).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/zip',
        }),
      );
      expect(reply.send).toHaveBeenCalledWith(exportFile.fileStream);
    });

    it('throws ForbiddenException when settings permission is denied', async () => {
      const deniedAbility = createMockAbility({ can: true });
      deniedAbility.cannot.mockImplementation(
        (action: string, subject: string) =>
          action === SpaceCaslAction.Manage && subject === SpaceCaslSubject.Settings,
      );
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);
      const reply = createMockFastifyReply();

      await expect(
        controller.exportSpace(
          {
            spaceId: 'space-locked',
            format: ExportFormat.Markdown,
            includeAttachments: false,
          },
          user,
          reply,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(exportService.exportSpace).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('propagates errors from export service', async () => {
      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility({ can: true }));
      exportService.exportSpace.mockRejectedValue(new Error('space export failed'));
      const reply = createMockFastifyReply();

      await expect(
        controller.exportSpace(
          {
            spaceId: 'space-1',
            format: ExportFormat.Markdown,
            includeAttachments: false,
          },
          user,
          reply,
        ),
      ).rejects.toThrow('space export failed');
    });

    it('uses false as default includeAttachments in audit metadata when omitted', async () => {
      const reply = createMockFastifyReply();
      const exportFile = {
        fileStream: { pipe: jest.fn() },
        fileName: 'Space.zip',
        spaceName: 'Space',
      };

      spaceAbilityFactory.createForUser.mockResolvedValue(createMockAbility({ can: true }));
      exportService.exportSpace.mockResolvedValue(exportFile);

      await controller.exportSpace(
        {
          spaceId: 'space-a',
          format: ExportFormat.HTML,
        },
        user,
        reply,
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            includeAttachments: false,
          }),
        }),
      );
    });
  });
});
