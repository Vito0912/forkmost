jest.mock('../../collaboration/collaboration.util', () => ({
  jsonToHtml: jest.fn().mockReturnValue('<p>html</p>'),
  jsonToMarkdown: jest.fn().mockReturnValue('# markdown'),
}));

jest.mock('../../common/helpers/prosemirror/utils', () => ({}));

import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CommentRepo } from '@docmost/db/repos/comment/comment.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  createMockAbility,
  createMockAuditService,
  createMockComment,
  createMockPage,
  createMockSpaceAbilityFactory,
  createMockUser,
  createMockWorkspace,
  createPaginationResult,
} from '../../test-utils/test-helpers';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { WsService } from '../../ws/ws.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { SpaceCaslAction, SpaceCaslSubject } from '../casl/interfaces/space-ability.type';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { PageAccessService } from '../page/page-access/page-access.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('CommentController', () => {
  let controller: CommentController;
  let commentService: any;
  let commentRepo: any;
  let pageRepo: any;
  let spaceAbilityFactory: any;
  let pageAccessService: any;
  let wsService: any;
  let auditService: any;

  const user = createMockUser();
  const workspace = createMockWorkspace();
  const baseCreateDto = {
    content: JSON.stringify({ type: 'doc', content: [] }),
    selection: 'selection',
    type: 'page',
    parentCommentId: '00000000-0000-0000-0000-000000000000',
  };
  const basePagination = {
    limit: 10,
    query: '',
    adminView: false,
  };

  beforeEach(async () => {
    commentService = {
      create: jest.fn(),
      findByPageId: jest.fn(),
      update: jest.fn(),
      resolve: jest.fn(),
    };

    commentRepo = {
      findById: jest.fn(),
      deleteComment: jest.fn(),
    };

    pageRepo = {
      findById: jest.fn(),
    };

    spaceAbilityFactory = createMockSpaceAbilityFactory(createMockAbility());

    pageAccessService = {
      validateCanView: jest.fn().mockResolvedValue(undefined),
      validateCanEdit: jest.fn().mockResolvedValue(undefined),
    };

    wsService = {
      emitCommentEvent: jest.fn().mockResolvedValue(undefined),
    };

    auditService = createMockAuditService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentController],
      providers: [
        { provide: CommentService, useValue: commentService },
        { provide: CommentRepo, useValue: commentRepo },
        { provide: PageRepo, useValue: pageRepo },
        { provide: SpaceAbilityFactory, useValue: spaceAbilityFactory },
        { provide: PageAccessService, useValue: pageAccessService },
        { provide: WsService, useValue: wsService },
        { provide: AUDIT_SERVICE, useValue: auditService },
      ],
    })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: jest.fn().mockReturnValue(true) })
    .compile();

    controller = module.get<CommentController>(CommentController);
  });

  describe('POST /comments/create', () => {
    it('creates comment when page exists and edit permission is granted', async () => {
      const page = createMockPage();
      const dto = { ...baseCreateDto, pageId: page.id };
      const created = createMockComment({ pageId: page.id });
      pageRepo.findById.mockResolvedValue(page);
      commentService.create.mockResolvedValue(created);

      const result = await controller.create(dto, user, workspace);

      expect(pageRepo.findById).toHaveBeenCalledWith(page.id);
      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(page, user);
      expect(commentService.create).toHaveBeenCalledWith(
        {
          userId: user.id,
          page,
          workspaceId: workspace.id,
        },
        dto,
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.COMMENT_CREATED,
          resourceType: AuditResource.COMMENT,
          resourceId: created.id,
          spaceId: page.spaceId,
          metadata: { pageId: page.id },
        }),
      );
      expect(result).toEqual(created);
    });

    it('throws when page is not found', async () => {
      pageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.create(
          { ...baseCreateDto, pageId: 'missing-page' },
          user,
          workspace,
        ),
      ).rejects.toThrow(new NotFoundException('Page not found'));

      expect(commentService.create).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('throws when page is deleted', async () => {
      const page = createMockPage({ deletedAt: new Date().toISOString() });
      pageRepo.findById.mockResolvedValue(page);

      await expect(
        controller.create(
          { ...baseCreateDto, pageId: page.id },
          user,
          workspace,
        ),
      ).rejects.toThrow(new NotFoundException('Page not found'));

      expect(commentService.create).not.toHaveBeenCalled();
    });

    it('propagates edit permission denial', async () => {
      const page = createMockPage();
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.create(
          { ...baseCreateDto, pageId: page.id },
          user,
          workspace,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(commentService.create).not.toHaveBeenCalled();
    });

    it('logs audit with created comment id', async () => {
      const page = createMockPage({ id: 'page-a', spaceId: 'space-a' });
      const created = createMockComment({ id: 'comment-a', pageId: page.id, spaceId: page.spaceId });
      pageRepo.findById.mockResolvedValue(page);
      commentService.create.mockResolvedValue(created);

      await controller.create(
        { ...baseCreateDto, pageId: page.id },
        user,
        workspace,
      );

      expect(auditService.log).toHaveBeenCalledWith({
        event: AuditEvent.COMMENT_CREATED,
        resourceType: AuditResource.COMMENT,
        resourceId: created.id,
        spaceId: page.spaceId,
        metadata: {
          pageId: page.id,
        },
      });
    });
  });

  describe('POST /comments/', () => {
    it('returns paginated page comments', async () => {
      const page = createMockPage();
      const pagination = { ...basePagination, cursor: 'cursor-a' };
      const resultSet = createPaginationResult([createMockComment({ pageId: page.id })]);
      pageRepo.findById.mockResolvedValue(page);
      commentService.findByPageId.mockResolvedValue(resultSet);

      const result = await controller.findPageComments({ pageId: page.id }, pagination, user);

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
      expect(commentService.findByPageId).toHaveBeenCalledWith(page.id, pagination);
      expect(result).toEqual(resultSet);
    });

    it('throws when page does not exist', async () => {
      pageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.findPageComments({ pageId: 'missing-page' }, basePagination, user),
      ).rejects.toThrow(new NotFoundException('Page not found'));

      expect(commentService.findByPageId).not.toHaveBeenCalled();
    });

    it('validates view permission before loading comments', async () => {
      const page = createMockPage({ id: 'page-a' });
      pageRepo.findById.mockResolvedValue(page);
      commentService.findByPageId.mockResolvedValue(createPaginationResult([]));

      await controller.findPageComments({ pageId: page.id }, basePagination, user);

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
    });

    it('propagates view permission denial', async () => {
      const page = createMockPage();
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanView.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.findPageComments({ pageId: page.id }, basePagination, user),
      ).rejects.toThrow(ForbiddenException);

      expect(commentService.findByPageId).not.toHaveBeenCalled();
    });

    it('passes pagination options to service', async () => {
      const page = createMockPage({ id: 'page-b' });
      const pagination = { ...basePagination, limit: 25, cursor: 'cursor-b' };
      pageRepo.findById.mockResolvedValue(page);
      commentService.findByPageId.mockResolvedValue(createPaginationResult([]));

      await controller.findPageComments({ pageId: page.id }, pagination, user);

      expect(commentService.findByPageId).toHaveBeenCalledWith(page.id, pagination);
    });
  });

  describe('POST /comments/info', () => {
    it('returns comment when it exists and user can view page', async () => {
      const comment = createMockComment({ id: 'comment-a', pageId: 'page-a' });
      const page = createMockPage({ id: comment.pageId });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);

      const result = await controller.findOne({ commentId: comment.id }, user);

      expect(commentRepo.findById).toHaveBeenCalledWith(comment.id);
      expect(pageRepo.findById).toHaveBeenCalledWith(comment.pageId);
      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
      expect(result).toEqual(comment);
    });

    it('throws when comment does not exist', async () => {
      commentRepo.findById.mockResolvedValue(null);

      await expect(controller.findOne({ commentId: 'missing-comment' }, user)).rejects.toThrow(
        new NotFoundException('Comment not found'),
      );

      expect(pageRepo.findById).not.toHaveBeenCalled();
    });

    it('throws when page does not exist', async () => {
      const comment = createMockComment({ id: 'comment-a', pageId: 'missing-page' });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(null);

      await expect(controller.findOne({ commentId: comment.id }, user)).rejects.toThrow(
        new NotFoundException('Page not found'),
      );

      expect(pageAccessService.validateCanView).not.toHaveBeenCalled();
    });

    it('validates view permission for comment page', async () => {
      const comment = createMockComment({ pageId: 'page-a' });
      const page = createMockPage({ id: comment.pageId });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);

      await controller.findOne({ commentId: comment.id }, user);

      expect(pageAccessService.validateCanView).toHaveBeenCalledWith(page, user);
    });

    it('propagates view permission denial', async () => {
      const comment = createMockComment({ pageId: 'page-a' });
      const page = createMockPage({ id: comment.pageId });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanView.mockRejectedValue(new ForbiddenException());

      await expect(controller.findOne({ commentId: comment.id }, user)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('POST /comments/update', () => {
    it('updates comment when comment and page exist', async () => {
      const comment = createMockComment({ id: 'comment-a', pageId: 'page-a' });
      const page = createMockPage({ id: comment.pageId });
      const dto = { commentId: comment.id, content: JSON.stringify({ type: 'doc', content: [] }) };
      const updated = createMockComment({ id: comment.id, content: { updated: true } });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);
      commentService.update.mockResolvedValue(updated);

      const result = await controller.update(dto, user);

      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(page, user);
      expect(commentService.update).toHaveBeenCalledWith(comment, dto, user);
      expect(result).toEqual(updated);
    });

    it('loads comment with creator and resolved-by relations', async () => {
      const comment = createMockComment({ id: 'comment-a', pageId: 'page-a' });
      const page = createMockPage({ id: comment.pageId });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);
      commentService.update.mockResolvedValue(comment);

      await controller.update(
        { commentId: comment.id, content: JSON.stringify({ type: 'doc' }) },
        user,
      );

      expect(commentRepo.findById).toHaveBeenCalledWith(comment.id, {
        includeCreator: true,
        includeResolvedBy: true,
      });
    });

    it('throws when comment does not exist', async () => {
      commentRepo.findById.mockResolvedValue(null);

      await expect(
        controller.update(
          { commentId: 'missing-comment', content: JSON.stringify({ type: 'doc' }) },
          user,
        ),
      ).rejects.toThrow(new NotFoundException('Comment not found'));

      expect(pageRepo.findById).not.toHaveBeenCalled();
    });

    it('throws when page does not exist', async () => {
      const comment = createMockComment({ id: 'comment-a', pageId: 'missing-page' });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.update(
          { commentId: comment.id, content: JSON.stringify({ type: 'doc' }) },
          user,
        ),
      ).rejects.toThrow(new NotFoundException('Page not found'));

      expect(commentService.update).not.toHaveBeenCalled();
    });

    it('propagates edit permission denial', async () => {
      const comment = createMockComment({ id: 'comment-a', pageId: 'page-a' });
      const page = createMockPage({ id: comment.pageId });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.update(
          { commentId: comment.id, content: JSON.stringify({ type: 'doc' }) },
          user,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(commentService.update).not.toHaveBeenCalled();
    });
  });

  describe('POST /comments/resolve', () => {
    it('resolves parent comment and writes audit event', async () => {
      const comment = createMockComment({ id: 'comment-a', pageId: 'page-a', parentCommentId: null });
      const page = createMockPage({ id: comment.pageId, spaceId: 'space-a' });
      const resolved = createMockComment({ id: comment.id, resolvedById: user.id });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);
      commentService.resolve.mockResolvedValue(resolved);

      const result = await controller.resolve(
        { commentId: comment.id, pageId: page.id, resolved: true },
        user,
      );

      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(page, user);
      expect(commentService.resolve).toHaveBeenCalledWith(comment, true, user);
      expect(auditService.log).toHaveBeenCalledWith({
        event: AuditEvent.COMMENT_RESOLVED,
        resourceType: AuditResource.COMMENT,
        resourceId: comment.id,
        spaceId: page.spaceId,
        metadata: {
          pageId: page.id,
          resolved: true,
        },
      });
      expect(result).toEqual(resolved);
    });

    it('supports unresolving parent comment', async () => {
      const comment = createMockComment({ id: 'comment-a', pageId: 'page-a', parentCommentId: null });
      const page = createMockPage({ id: comment.pageId });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);
      commentService.resolve.mockResolvedValue(comment);

      await controller.resolve({ commentId: comment.id, pageId: page.id, resolved: false }, user);

      expect(commentService.resolve).toHaveBeenCalledWith(comment, false, user);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            pageId: page.id,
            resolved: false,
          },
        }),
      );
    });

    it('throws when comment does not exist', async () => {
      commentRepo.findById.mockResolvedValue(null);

      await expect(
        controller.resolve({ commentId: 'missing-comment', pageId: 'page-a', resolved: true }, user),
      ).rejects.toThrow(new NotFoundException('Comment not found'));

      expect(commentService.resolve).not.toHaveBeenCalled();
    });

    it('throws when comment is a child comment', async () => {
      const childComment = createMockComment({ parentCommentId: 'parent-id' });
      commentRepo.findById.mockResolvedValue(childComment);

      await expect(
        controller.resolve({ commentId: childComment.id, pageId: childComment.pageId, resolved: true }, user),
      ).rejects.toThrow(new ForbiddenException('Only parent comments can be resolved'));

      expect(pageRepo.findById).not.toHaveBeenCalled();
      expect(commentService.resolve).not.toHaveBeenCalled();
    });

    it('throws when page does not exist', async () => {
      const comment = createMockComment({ id: 'comment-a', pageId: 'missing-page', parentCommentId: null });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.resolve({ commentId: comment.id, pageId: comment.pageId, resolved: true }, user),
      ).rejects.toThrow(new NotFoundException('Page not found'));

      expect(commentService.resolve).not.toHaveBeenCalled();
    });

    it('loads comment with creator and resolved-by relations', async () => {
      const comment = createMockComment({ id: 'comment-a', pageId: 'page-a', parentCommentId: null });
      const page = createMockPage({ id: comment.pageId });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);
      commentService.resolve.mockResolvedValue(comment);

      await controller.resolve({ commentId: comment.id, pageId: page.id, resolved: true }, user);

      expect(commentRepo.findById).toHaveBeenCalledWith(comment.id, {
        includeCreator: true,
        includeResolvedBy: true,
      });
    });

    it('propagates edit permission denial', async () => {
      const comment = createMockComment({ id: 'comment-a', pageId: 'page-a', parentCommentId: null });
      const page = createMockPage({ id: comment.pageId });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.resolve({ commentId: comment.id, pageId: page.id, resolved: true }, user),
      ).rejects.toThrow(ForbiddenException);

      expect(commentService.resolve).not.toHaveBeenCalled();
    });
  });

  describe('POST /comments/delete', () => {
    it('deletes own comment and emits websocket event with audit log', async () => {
      const comment = createMockComment({ id: 'comment-a', pageId: 'page-a', spaceId: 'space-a', creatorId: user.id });
      const page = createMockPage({ id: comment.pageId });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);

      await controller.delete({ commentId: comment.id }, user);

      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(page, user);
      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
      expect(commentRepo.deleteComment).toHaveBeenCalledWith(comment.id);
      expect(wsService.emitCommentEvent).toHaveBeenCalledWith(comment.spaceId, comment.pageId, {
        operation: 'commentDeleted',
        pageId: comment.pageId,
        commentId: comment.id,
      });
      expect(auditService.log).toHaveBeenCalledWith({
        event: AuditEvent.COMMENT_DELETED,
        resourceType: AuditResource.COMMENT,
        resourceId: comment.id,
        spaceId: comment.spaceId,
        changes: {
          before: {
            pageId: comment.pageId,
            creatorId: comment.creatorId,
          },
        },
      });
    });

    it('deletes comment as space admin when not owner', async () => {
      const comment = createMockComment({
        id: 'comment-a',
        pageId: 'page-a',
        spaceId: 'space-a',
        creatorId: 'different-user',
      });
      const page = createMockPage({ id: comment.pageId });
      const adminAbility = createMockAbility({ can: true });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);
      spaceAbilityFactory.createForUser.mockResolvedValue(adminAbility);

      await controller.delete({ commentId: comment.id }, user);

      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, comment.spaceId);
      expect(adminAbility.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Manage,
        SpaceCaslSubject.Settings,
      );
      expect(commentRepo.deleteComment).toHaveBeenCalledWith(comment.id);
    });

    it('throws when not owner and not space admin', async () => {
      const comment = createMockComment({
        id: 'comment-a',
        pageId: 'page-a',
        spaceId: 'space-a',
        creatorId: 'different-user',
      });
      const page = createMockPage({ id: comment.pageId });
      const deniedAbility = createMockAbility({ can: false });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);

      await expect(controller.delete({ commentId: comment.id }, user)).rejects.toThrow(
        new ForbiddenException('You can only delete your own comments or must be a space admin'),
      );

      expect(commentRepo.deleteComment).not.toHaveBeenCalled();
      expect(wsService.emitCommentEvent).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('throws when comment does not exist', async () => {
      commentRepo.findById.mockResolvedValue(null);

      await expect(controller.delete({ commentId: 'missing-comment' }, user)).rejects.toThrow(
        new NotFoundException('Comment not found'),
      );

      expect(pageRepo.findById).not.toHaveBeenCalled();
    });

    it('throws when page does not exist', async () => {
      const comment = createMockComment({ pageId: 'missing-page' });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(null);

      await expect(controller.delete({ commentId: comment.id }, user)).rejects.toThrow(
        new NotFoundException('Page not found'),
      );

      expect(commentRepo.deleteComment).not.toHaveBeenCalled();
    });

    it('validates edit permission before owner/admin checks', async () => {
      const comment = createMockComment({ creatorId: user.id });
      const page = createMockPage({ id: comment.pageId });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);

      await controller.delete({ commentId: comment.id }, user);

      expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(page, user);
    });

    it('propagates edit permission denial', async () => {
      const comment = createMockComment({ creatorId: user.id });
      const page = createMockPage({ id: comment.pageId });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);
      pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

      await expect(controller.delete({ commentId: comment.id }, user)).rejects.toThrow(
        ForbiddenException,
      );

      expect(commentRepo.deleteComment).not.toHaveBeenCalled();
      expect(wsService.emitCommentEvent).not.toHaveBeenCalled();
    });

    it('emits websocket event after deleting as space admin', async () => {
      const comment = createMockComment({
        id: 'comment-b',
        pageId: 'page-b',
        spaceId: 'space-b',
        creatorId: 'different-user',
      });
      const page = createMockPage({ id: comment.pageId });
      const adminAbility = createMockAbility({ can: true });
      commentRepo.findById.mockResolvedValue(comment);
      pageRepo.findById.mockResolvedValue(page);
      spaceAbilityFactory.createForUser.mockResolvedValue(adminAbility);

      await controller.delete({ commentId: comment.id }, user);

      expect(wsService.emitCommentEvent).toHaveBeenCalledWith(comment.spaceId, comment.pageId, {
        operation: 'commentDeleted',
        pageId: comment.pageId,
        commentId: comment.id,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.COMMENT_DELETED,
          resourceType: AuditResource.COMMENT,
          resourceId: comment.id,
          spaceId: comment.spaceId,
        }),
      );
    });
  });
});
