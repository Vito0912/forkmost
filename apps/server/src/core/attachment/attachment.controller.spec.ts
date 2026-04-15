import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { AttachmentController } from './attachment.controller';
import { AttachmentType } from './attachment.constants';
import { AttachmentService } from './services/attachment.service';
import { StorageService } from '../../integrations/storage/storage.service';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { TokenService } from '../auth/services/token.service';
import { AuthProviderRepo } from '../../database/repos/auth-provider/auth-provider.repo';
import { PageAccessService } from '../page/page-access/page-access.service';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { JwtType } from '../auth/dto/jwt-payload';
import {
  createMockAbility,
  createMockAttachment,
  createMockAuditService,
  createMockFastifyReply,
  createMockFastifyRequest,
  createMockPage,
  createMockSpaceAbilityFactory,
  createMockUser,
  createMockWorkspace,
  createMockWorkspaceAbilityFactory,
} from '../../test-utils/test-helpers';

describe('AttachmentController', () => {
  let controller: AttachmentController;
  let attachmentService: {
    uploadFile: jest.Mock;
    uploadImage: jest.Mock;
    removeUserAvatar: jest.Mock;
    removeSpaceIcon: jest.Mock;
    removeWorkspaceIcon: jest.Mock;
  };
  let storageService: {
    readStream: jest.Mock;
    readRangeStream: jest.Mock;
  };
  let workspaceAbilityFactory: {
    createForUser: jest.Mock;
  };
  let spaceAbilityFactory: {
    createForUser: jest.Mock;
  };
  let pageRepo: {
    findById: jest.Mock;
  };
  let attachmentRepo: {
    findById: jest.Mock;
  };
  let environmentService: {
    getFileUploadSizeLimit: jest.Mock;
    isCloud: jest.Mock;
  };
  let tokenService: {
    verifyJwt: jest.Mock;
  };
  let authProviderRepo: {
    findOidcProvider: jest.Mock;
  };
  let pageAccessService: {
    validateCanEdit: jest.Mock;
    validateCanView: jest.Mock;
  };
  let auditService: {
    log: jest.Mock;
  };

  const user = createMockUser({
    id: 'f4cc77d8-17f6-4fcf-a930-9a1b2b132249',
    workspaceId: '11111111-1111-4111-8111-111111111111',
  });

  const workspace = createMockWorkspace({
    id: '11111111-1111-4111-8111-111111111111',
  });

  const fileId = '22222222-2222-4222-8222-222222222222';
  const pageId = '33333333-3333-4333-8333-333333333333';
  const spaceId = '44444444-4444-4444-8444-444444444444';

  beforeEach(async () => {
    jest.clearAllMocks();

    attachmentService = {
      uploadFile: jest.fn(),
      uploadImage: jest.fn(),
      removeUserAvatar: jest.fn(),
      removeSpaceIcon: jest.fn(),
      removeWorkspaceIcon: jest.fn(),
    };

    storageService = {
      readStream: jest.fn(),
      readRangeStream: jest.fn(),
    };

    workspaceAbilityFactory = createMockWorkspaceAbilityFactory(createMockAbility());
    spaceAbilityFactory = createMockSpaceAbilityFactory(createMockAbility());

    pageRepo = {
      findById: jest.fn(),
    };

    attachmentRepo = {
      findById: jest.fn(),
    };

    environmentService = {
      getFileUploadSizeLimit: jest.fn().mockReturnValue('10MB'),
      isCloud: jest.fn().mockReturnValue(false),
    };

    tokenService = {
      verifyJwt: jest.fn(),
    };

    authProviderRepo = {
      findOidcProvider: jest.fn().mockResolvedValue(null),
    };

    pageAccessService = {
      validateCanEdit: jest.fn().mockResolvedValue(undefined),
      validateCanView: jest.fn().mockResolvedValue(undefined),
    };

    auditService = createMockAuditService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttachmentController],
      providers: [
        { provide: AttachmentService, useValue: attachmentService },
        { provide: StorageService, useValue: storageService },
        { provide: WorkspaceAbilityFactory, useValue: workspaceAbilityFactory },
        { provide: SpaceAbilityFactory, useValue: spaceAbilityFactory },
        { provide: PageRepo, useValue: pageRepo },
        { provide: AttachmentRepo, useValue: attachmentRepo },
        { provide: EnvironmentService, useValue: environmentService },
        { provide: TokenService, useValue: tokenService },
        { provide: AuthProviderRepo, useValue: authProviderRepo },
        { provide: PageAccessService, useValue: pageAccessService },
        { provide: AUDIT_SERVICE, useValue: auditService },
      ],
    }).compile();

    controller = module.get<AttachmentController>(AttachmentController);
  });

  function createMultipartFile(fields: Record<string, string>) {
    const builtFields: Record<string, { value: string }> = {};
    for (const [key, value] of Object.entries(fields)) {
      builtFields[key] = { value };
    }
    return {
      filename: 'test-file.pdf',
      fields: builtFields,
    };
  }

  describe('POST /files/upload', () => {
    it('uploads file with valid pageId', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();
      const page = createMockPage({ id: pageId, spaceId });
      const file = createMultipartFile({ pageId });
      const uploaded = createMockAttachment({ id: fileId, pageId, spaceId, workspaceId: workspace.id });

      req.file.mockResolvedValue(file);
      pageRepo.findById.mockResolvedValue(page);
      attachmentService.uploadFile.mockResolvedValue(uploaded);

      await controller.uploadFile(req, res, user, workspace);

      expect(req.file).toHaveBeenCalled();
      expect(pageRepo.findById).toHaveBeenCalledWith(pageId);
      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(page, user);
      expect(attachmentService.uploadFile).toHaveBeenCalledWith({
        filePromise: file,
        pageId,
        spaceId,
        userId: user.id,
        workspaceId: workspace.id,
        attachmentId: undefined,
      });
      expect(res.send).toHaveBeenCalledWith(uploaded);
      expect(auditService.log).toHaveBeenCalled();
    });

    it('throws when file is missing', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      req.file.mockResolvedValue(null);

      await expect(controller.uploadFile(req, res, user, workspace)).rejects.toThrow(
        new BadRequestException('Failed to upload file'),
      );
    });

    it('throws when pageId is missing', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      req.file.mockResolvedValue(createMultipartFile({}));

      await expect(controller.uploadFile(req, res, user, workspace)).rejects.toThrow(
        new BadRequestException('PageId is required'),
      );
    });

    it('throws when page is not found', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      req.file.mockResolvedValue(createMultipartFile({ pageId }));
      pageRepo.findById.mockResolvedValue(null);

      await expect(controller.uploadFile(req, res, user, workspace)).rejects.toThrow(
        new NotFoundException('Page not found'),
      );
    });

    it('throws when attachmentId is invalid', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();
      const page = createMockPage({ id: pageId, spaceId });

      req.file.mockResolvedValue(createMultipartFile({ pageId, attachmentId: 'bad-id' }));
      pageRepo.findById.mockResolvedValue(page);

      await expect(controller.uploadFile(req, res, user, workspace)).rejects.toThrow(
        new BadRequestException('Invalid attachment id'),
      );
    });

    it('throws when multipart parser returns 413', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      req.file.mockRejectedValue({ statusCode: 413, message: 'too large' });

      await expect(controller.uploadFile(req, res, user, workspace)).rejects.toThrow(
        new BadRequestException('File too large. Exceeds the 10MB limit'),
      );
    });

    it('throws when attachment service returns 413', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();
      const page = createMockPage({ id: pageId, spaceId });

      req.file.mockResolvedValue(createMultipartFile({ pageId }));
      pageRepo.findById.mockResolvedValue(page);
      attachmentService.uploadFile.mockRejectedValue({ statusCode: 413 });

      await expect(controller.uploadFile(req, res, user, workspace)).rejects.toThrow(
        new BadRequestException('File too large. Exceeds the 10MB limit'),
      );
    });
  });

  describe('GET /files/:fileId/:fileName', () => {
    it('serves file with correct headers', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();
      const attachment = createMockAttachment({
        id: fileId,
        pageId,
        spaceId,
        workspaceId: workspace.id,
        filePath: '11111111-1111-4111-8111-111111111111/files/a.txt',
        fileExt: '.txt',
        fileName: 'a.txt',
        fileSize: '1024',
        mimeType: 'text/plain',
      });
      const page = createMockPage({ id: pageId, spaceId });

      attachmentRepo.findById.mockResolvedValue(attachment);
      pageRepo.findById.mockResolvedValue(page);
      storageService.readStream.mockResolvedValue('stream');

      await controller.getFile(req, res, user, workspace, fileId, 'a.txt');

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
      expect(res.header).toHaveBeenCalledWith('Accept-Ranges', 'bytes');
      expect(res.header).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="a.txt"',
      );
      expect(res.headers).toHaveBeenCalledWith({
        'Content-Type': 'text/plain',
        'Cache-Control': 'private, max-age=3600',
      });
      expect(res.header).toHaveBeenCalledWith('Content-Length', 1024);
      expect(res.send).toHaveBeenCalledWith('stream');
    });

    it('returns partial content when range header is valid', async () => {
      const req = createMockFastifyRequest({ headers: { range: 'bytes=0-9' } });
      const res = createMockFastifyReply();
      const attachment = createMockAttachment({
        id: fileId,
        pageId,
        spaceId,
        workspaceId: workspace.id,
        filePath: 'files/range.pdf',
        fileExt: '.pdf',
        fileSize: '100',
        mimeType: 'application/pdf',
      });
      const page = createMockPage({ id: pageId, spaceId });

      attachmentRepo.findById.mockResolvedValue(attachment);
      pageRepo.findById.mockResolvedValue(page);
      storageService.readRangeStream.mockResolvedValue('range-stream');

      await controller.getFile(req, res, user, workspace, fileId, 'range.pdf');

      expect(storageService.readRangeStream).toHaveBeenCalledWith(attachment.filePath, {
        start: 0,
        end: 9,
      });
      expect(res.status).toHaveBeenCalledWith(206);
      expect(res.headers).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Range': 'bytes 0-9/100',
        'Content-Length': 10,
        'Cache-Control': 'private, max-age=3600',
      });
    });

    it('throws when file id is not uuid', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      await expect(controller.getFile(req, res, user, workspace, 'bad-id', 'x.pdf')).rejects.toThrow(
        new NotFoundException('Invalid file id'),
      );
    });

    it('throws when attachment is not found', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      attachmentRepo.findById.mockResolvedValue(null);

      await expect(controller.getFile(req, res, user, workspace, fileId, 'x.pdf')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws when attachment workspace mismatches current workspace', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();
      const attachment = createMockAttachment({
        id: fileId,
        pageId,
        spaceId,
        workspaceId: '55555555-5555-4555-8555-555555555555',
      });

      attachmentRepo.findById.mockResolvedValue(attachment);

      await expect(controller.getFile(req, res, user, workspace, fileId, 'x.pdf')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws when page for attachment is not found', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();
      const attachment = createMockAttachment({ id: fileId, pageId, spaceId, workspaceId: workspace.id });

      attachmentRepo.findById.mockResolvedValue(attachment);
      pageRepo.findById.mockResolvedValue(null);

      await expect(controller.getFile(req, res, user, workspace, fileId, 'x.pdf')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('validates view permission', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();
      const attachment = createMockAttachment({ id: fileId, pageId, spaceId, workspaceId: workspace.id });
      const page = createMockPage({ id: pageId, spaceId });

      attachmentRepo.findById.mockResolvedValue(attachment);
      pageRepo.findById.mockResolvedValue(page);
      storageService.readStream.mockResolvedValue('stream');

      await controller.getFile(req, res, user, workspace, fileId, 'x.pdf');

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
    });
  });

  describe('GET /files/public/:fileId/:fileName', () => {
    it('serves public file with valid jwt', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();
      const attachment = createMockAttachment({ id: fileId, pageId, spaceId, workspaceId: workspace.id });

      tokenService.verifyJwt.mockResolvedValue({
        attachmentId: fileId,
        workspaceId: workspace.id,
        pageId,
        type: 'attachment',
      });
      attachmentRepo.findById.mockResolvedValue(attachment);
      storageService.readStream.mockResolvedValue('public-stream');

      await controller.getPublicFile(req, res, workspace, fileId, 'x.pdf', 'jwt-token');

      expect(tokenService.verifyJwt).toHaveBeenCalledWith('jwt-token', JwtType.ATTACHMENT);
      expect(res.headers).toHaveBeenCalledWith({
        'Content-Type': attachment.mimeType,
        'Cache-Control': 'public, max-age=3600',
      });
      expect(res.send).toHaveBeenCalledWith('public-stream');
    });

    it('throws when jwt is invalid or expired', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      tokenService.verifyJwt.mockRejectedValue(new Error('expired'));

      await expect(
        controller.getPublicFile(req, res, workspace, fileId, 'x.pdf', 'bad-token'),
      ).rejects.toThrow(new BadRequestException('Expired or invalid attachment access token'));
    });

    it('throws when fileId mismatches jwt payload', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      tokenService.verifyJwt.mockResolvedValue({
        attachmentId: '66666666-6666-4666-8666-666666666666',
        workspaceId: workspace.id,
        pageId,
        type: 'attachment',
      });

      await expect(
        controller.getPublicFile(req, res, workspace, fileId, 'x.pdf', 'token'),
      ).rejects.toThrow(new NotFoundException('File not found'));
    });

    it('throws when jwt workspace mismatches current workspace', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      tokenService.verifyJwt.mockResolvedValue({
        attachmentId: fileId,
        workspaceId: '77777777-7777-4777-8777-777777777777',
        pageId,
        type: 'attachment',
      });

      await expect(
        controller.getPublicFile(req, res, workspace, fileId, 'x.pdf', 'token'),
      ).rejects.toThrow(new NotFoundException('File not found'));
    });

    it('throws when persisted attachment workspace mismatches', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();
      const attachment = createMockAttachment({
        id: fileId,
        pageId,
        spaceId,
        workspaceId: '88888888-8888-4888-8888-888888888888',
      });

      tokenService.verifyJwt.mockResolvedValue({
        attachmentId: fileId,
        workspaceId: workspace.id,
        pageId,
        type: 'attachment',
      });
      attachmentRepo.findById.mockResolvedValue(attachment);

      await expect(
        controller.getPublicFile(req, res, workspace, fileId, 'x.pdf', 'token'),
      ).rejects.toThrow(new NotFoundException('File not found'));
    });
  });

  describe('POST /attachments/upload-image', () => {
    it('uploads avatar image successfully', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();
      const file = createMultipartFile({ type: AttachmentType.Avatar });
      const uploaded = createMockAttachment({ id: fileId, type: AttachmentType.Avatar });

      req.file.mockResolvedValue(file);
      attachmentService.uploadImage.mockResolvedValue(uploaded);

      await controller.uploadAvatarOrLogo(req, res, user, workspace);

      expect(authProviderRepo.findOidcProvider).toHaveBeenCalledWith(workspace.id);
      expect(attachmentService.uploadImage).toHaveBeenCalledWith(
        file,
        AttachmentType.Avatar,
        user.id,
        workspace.id,
        undefined,
      );
      expect(res.send).toHaveBeenCalledWith(uploaded);
    });

    it('throws when file is missing', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      req.file.mockResolvedValue(null);

      await expect(controller.uploadAvatarOrLogo(req, res, user, workspace)).rejects.toThrow(
        new BadRequestException('Invalid file upload'),
      );
    });

    it('throws when attachment type is missing', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      req.file.mockResolvedValue(createMultipartFile({}));

      await expect(controller.uploadAvatarOrLogo(req, res, user, workspace)).rejects.toThrow(
        new BadRequestException('attachment type is required'),
      );
    });

    it('throws when image type is invalid', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      req.file.mockResolvedValue(createMultipartFile({ type: AttachmentType.File }));

      await expect(controller.uploadAvatarOrLogo(req, res, user, workspace)).rejects.toThrow(
        new BadRequestException('Invalid image attachment type'),
      );
    });

    it('throws when avatar is managed by OIDC', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      req.file.mockResolvedValue(createMultipartFile({ type: AttachmentType.Avatar }));
      authProviderRepo.findOidcProvider.mockResolvedValue({ oidcAvatarAttribute: 'picture' });

      await expect(controller.uploadAvatarOrLogo(req, res, user, workspace)).rejects.toThrow(
        new ForbiddenException('Avatar is managed by your identity provider'),
      );
    });

    it('throws when workspace icon permission is denied', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();
      const denied = createMockAbility({ can: false });

      req.file.mockResolvedValue(createMultipartFile({ type: AttachmentType.WorkspaceIcon }));
      workspaceAbilityFactory.createForUser.mockReturnValue(denied);

      await expect(controller.uploadAvatarOrLogo(req, res, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws when space icon type is set but spaceId is missing', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();

      req.file.mockResolvedValue(createMultipartFile({ type: AttachmentType.SpaceIcon }));

      await expect(controller.uploadAvatarOrLogo(req, res, user, workspace)).rejects.toThrow(
        new BadRequestException('spaceId is required'),
      );
    });

    it('throws when space icon permission is denied', async () => {
      const req = createMockFastifyRequest();
      const res = createMockFastifyReply();
      const denied = createMockAbility({ can: false });

      req.file.mockResolvedValue(createMultipartFile({ type: AttachmentType.SpaceIcon, spaceId }));
      spaceAbilityFactory.createForUser.mockResolvedValue(denied);

      await expect(controller.uploadAvatarOrLogo(req, res, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('GET /attachments/img/:attachmentType/:fileName', () => {
    it('serves image successfully', async () => {
      const res = createMockFastifyReply();
      const imageId = '99999999-9999-4999-8999-999999999999';
      const fileName = `${imageId}.png`;

      storageService.readStream.mockResolvedValue('img-stream');

      await controller.getLogoOrAvatar(res, workspace, AttachmentType.Avatar, fileName);

      expect(storageService.readStream).toHaveBeenCalledWith(`${workspace.id}/avatars/${fileName}`);
      expect(res.headers).toHaveBeenCalledWith({
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=86400',
      });
      expect(res.send).toHaveBeenCalledWith('img-stream');
    });

    it('throws when attachment type is invalid', async () => {
      const res = createMockFastifyReply();
      const fileName = '99999999-9999-4999-8999-999999999999.png';

      await expect(
        controller.getLogoOrAvatar(res, workspace, AttachmentType.File, fileName),
      ).rejects.toThrow(new BadRequestException('Invalid image attachment type'));
    });

    it('throws when file id is invalid', async () => {
      const res = createMockFastifyReply();

      await expect(
        controller.getLogoOrAvatar(res, workspace, AttachmentType.Avatar, 'invalid-name.png'),
      ).rejects.toThrow(new BadRequestException('Invalid file id'));
    });

    it('throws when image file is not found', async () => {
      const res = createMockFastifyReply();
      const fileName = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';

      storageService.readStream.mockRejectedValue(new Error('missing'));

      await expect(
        controller.getLogoOrAvatar(res, workspace, AttachmentType.WorkspaceIcon, fileName),
      ).rejects.toThrow(new NotFoundException('File not found'));
    });
  });

  describe('POST /files/info', () => {
    it('returns attachment info', async () => {
      const attachment = createMockAttachment({
        id: fileId,
        pageId,
        spaceId,
        workspaceId: workspace.id,
        type: AttachmentType.File,
      });
      const page = createMockPage({ id: pageId, spaceId });

      attachmentRepo.findById.mockResolvedValue(attachment);
      pageRepo.findById.mockResolvedValue(page);

      const result = await controller.getAttachmentInfo({ attachmentId: fileId }, workspace, user);

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
      expect(result).toEqual(attachment);
    });

    it('throws when attachment is not found', async () => {
      attachmentRepo.findById.mockResolvedValue(null);

      await expect(controller.getAttachmentInfo({ attachmentId: fileId }, workspace, user)).rejects.toThrow(
        new NotFoundException('File not found'),
      );
    });

    it('throws when workspace mismatches', async () => {
      const attachment = createMockAttachment({
        id: fileId,
        pageId,
        type: AttachmentType.File,
        workspaceId: 'b4a9bd2f-d37e-4004-8d16-1e7cb3a5b6c9',
      });
      attachmentRepo.findById.mockResolvedValue(attachment);

      await expect(controller.getAttachmentInfo({ attachmentId: fileId }, workspace, user)).rejects.toThrow(
        new NotFoundException('File not found'),
      );
    });

    it('throws when attachment type is not file', async () => {
      const attachment = createMockAttachment({
        id: fileId,
        pageId,
        workspaceId: workspace.id,
        type: AttachmentType.Avatar,
      });
      attachmentRepo.findById.mockResolvedValue(attachment);

      await expect(controller.getAttachmentInfo({ attachmentId: fileId }, workspace, user)).rejects.toThrow(
        new NotFoundException('File not found'),
      );
    });

    it('throws when page is not found', async () => {
      const attachment = createMockAttachment({
        id: fileId,
        pageId,
        workspaceId: workspace.id,
        type: AttachmentType.File,
      });
      attachmentRepo.findById.mockResolvedValue(attachment);
      pageRepo.findById.mockResolvedValue(null);

      await expect(controller.getAttachmentInfo({ attachmentId: fileId }, workspace, user)).rejects.toThrow(
        new NotFoundException('File not found'),
      );
    });
  });

  describe('POST /attachments/remove-icon', () => {
    it('removes avatar successfully', async () => {
      await controller.removeIcon({ type: AttachmentType.Avatar, spaceId: undefined }, user, workspace);

      expect(authProviderRepo.findOidcProvider).toHaveBeenCalledWith(workspace.id);
      expect(attachmentService.removeUserAvatar).toHaveBeenCalledWith(user);
    });

    it('throws when avatar is managed by OIDC', async () => {
      authProviderRepo.findOidcProvider.mockResolvedValue({ oidcAvatarAttribute: 'picture' });

      await expect(
        controller.removeIcon({ type: AttachmentType.Avatar, spaceId: undefined }, user, workspace),
      ).rejects.toThrow(new ForbiddenException('Avatar is managed by your identity provider'));
    });

    it('removes space icon successfully', async () => {
      await controller.removeIcon({ type: AttachmentType.SpaceIcon, spaceId }, user, workspace);

      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, spaceId);
      expect(attachmentService.removeSpaceIcon).toHaveBeenCalledWith(spaceId, workspace.id);
    });

    it('throws when remove space icon is missing spaceId', async () => {
      await expect(
        controller.removeIcon({ type: AttachmentType.SpaceIcon, spaceId: undefined }, user, workspace),
      ).rejects.toThrow(new BadRequestException('spaceId is required to change space icons'));
    });

    it('throws when remove space icon permission is denied', async () => {
      const denied = createMockAbility({ can: false });
      spaceAbilityFactory.createForUser.mockResolvedValue(denied);

      await expect(
        controller.removeIcon({ type: AttachmentType.SpaceIcon, spaceId }, user, workspace),
      ).rejects.toThrow(ForbiddenException);
    });

    it('removes workspace icon successfully', async () => {
      await controller.removeIcon({ type: AttachmentType.WorkspaceIcon, spaceId: undefined }, user, workspace);

      expect(workspaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, workspace);
      expect(attachmentService.removeWorkspaceIcon).toHaveBeenCalledWith(workspace);
    });

    it('throws when remove workspace icon permission is denied', async () => {
      const denied = createMockAbility({ can: false });
      workspaceAbilityFactory.createForUser.mockReturnValue(denied);

      await expect(
        controller.removeIcon({ type: AttachmentType.WorkspaceIcon, spaceId: undefined }, user, workspace),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
