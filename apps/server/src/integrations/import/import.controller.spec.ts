import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  createMockAbility,
  createMockAuditService,
  createMockFastifyRequest,
  createMockSpaceAbilityFactory,
  createMockUser,
  createMockWorkspace,
} from '../../test-utils/test-helpers';
import { AUDIT_SERVICE } from '../audit/audit.service';
import { EnvironmentService } from '../environment/environment.service';
import { ImportController } from './import.controller';
import { ImportService } from './services/import.service';

jest.mock('./services/import.service', () => ({
  ImportService: class ImportService {},
}));

describe('ImportController', () => {
  let controller: ImportController;
  let importService: {
    importPage: jest.Mock;
    importZip: jest.Mock;
  };
  let spaceAbilityFactory: { createForUser: jest.Mock };
  let environmentService: {
    getFileImportSizeLimit: jest.Mock;
  };
  let auditService: { log: jest.Mock };

  const user = createMockUser({ id: 'user-import-1' });
  const workspace = createMockWorkspace({ id: 'workspace-import-1' });

  beforeEach(async () => {
    importService = {
      importPage: jest.fn(),
      importZip: jest.fn(),
    };

    spaceAbilityFactory = createMockSpaceAbilityFactory(createMockAbility()) as {
      createForUser: jest.Mock;
    };

    environmentService = {
      getFileImportSizeLimit: jest.fn().mockReturnValue('10mb'),
    };

    auditService = createMockAuditService() as { log: jest.Mock };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportController],
      providers: [
        { provide: ImportService, useValue: importService },
        { provide: SpaceAbilityFactory, useValue: spaceAbilityFactory },
        { provide: EnvironmentService, useValue: environmentService },
        { provide: AUDIT_SERVICE, useValue: auditService },
      ],
    }).compile();

    controller = module.get<ImportController>(ImportController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /pages/import', () => {
    it('imports a page successfully', async () => {
      const file = {
        filename: 'guide.md',
        fields: {
          spaceId: { value: 'space-1' },
        },
      };
      const req = createMockFastifyRequest({ file: jest.fn().mockResolvedValue(file) });
      const createdPage = { id: 'page-1', spaceId: 'space-1' };

      importService.importPage.mockResolvedValue(createdPage);

      const result = await controller.importPage(req, user, workspace);

      expect(req.file).toHaveBeenCalledWith(
        expect.objectContaining({
          limits: expect.objectContaining({ files: 1 }),
        }),
      );
      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, 'space-1');
      expect(importService.importPage).toHaveBeenCalledWith(
        file,
        user.id,
        'space-1',
        workspace.id,
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: 'space-1',
          metadata: expect.objectContaining({
            source: 'markdown',
            fileName: 'guide.md',
          }),
        }),
      );
      expect(result).toEqual(createdPage);
    });

    it('throws BadRequestException when file upload fails', async () => {
      const req = createMockFastifyRequest({ file: jest.fn().mockResolvedValue(null) });

      await expect(controller.importPage(req, user, workspace)).rejects.toThrow(
        new BadRequestException('Failed to upload file'),
      );
      expect(importService.importPage).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid file extension', async () => {
      const req = createMockFastifyRequest({
        file: jest.fn().mockResolvedValue({
          filename: 'image.png',
          fields: { spaceId: { value: 'space-1' } },
        }),
      });

      await expect(controller.importPage(req, user, workspace)).rejects.toThrow(
        new BadRequestException('Invalid import file type.'),
      );
    });

    it('throws BadRequestException when spaceId is missing', async () => {
      const req = createMockFastifyRequest({
        file: jest.fn().mockResolvedValue({
          filename: 'guide.md',
          fields: {},
        }),
      });

      await expect(controller.importPage(req, user, workspace)).rejects.toThrow(
        new BadRequestException('spaceId is required'),
      );
      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when page edit permission is denied', async () => {
      const deniedAbility = createMockAbility({ can: false });
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);

      const req = createMockFastifyRequest({
        file: jest.fn().mockResolvedValue({
          filename: 'guide.md',
          fields: { spaceId: { value: 'space-locked' } },
        }),
      });

      await expect(controller.importPage(req, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
      expect(importService.importPage).not.toHaveBeenCalled();
    });
  });

  describe('POST /pages/import-zip', () => {
    it('imports zip successfully for valid source and permissions', async () => {
      const file = {
        filename: 'docs.zip',
        fields: {
          spaceId: { value: 'space-1' },
          source: { value: 'generic' },
        },
      };
      const req = createMockFastifyRequest({ file: jest.fn().mockResolvedValue(file) });
      const task = { id: 'task-1', spaceId: 'space-1' };

      importService.importZip.mockResolvedValue(task);

      const result = await controller.importZip(req, user, workspace);

      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, 'space-1');
      expect(importService.importZip).toHaveBeenCalledWith(
        file,
        'generic',
        user.id,
        'space-1',
        workspace.id,
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: 'space-1',
          metadata: expect.objectContaining({
            source: 'generic',
            fileName: 'docs.zip',
          }),
        }),
      );
      expect(result).toEqual(task);
    });

    it('throws BadRequestException when zip source is invalid', async () => {
      const req = createMockFastifyRequest({
        file: jest.fn().mockResolvedValue({
          filename: 'docs.zip',
          fields: {
            spaceId: { value: 'space-1' },
            source: { value: 'confluence' },
          },
        }),
      });

      await expect(controller.importZip(req, user, workspace)).rejects.toThrow(
        new BadRequestException(
          'Invalid import source. Import source must either be generic or notion.',
        ),
      );
      expect(importService.importZip).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when zip import permission is denied', async () => {
      const deniedAbility = createMockAbility({ can: false });
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);
      const req = createMockFastifyRequest({
        file: jest.fn().mockResolvedValue({
          filename: 'docs.zip',
          fields: {
            spaceId: { value: 'space-locked' },
            source: { value: 'notion' },
          },
        }),
      });

      await expect(controller.importZip(req, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
      expect(importService.importZip).not.toHaveBeenCalled();
    });
  });
});
