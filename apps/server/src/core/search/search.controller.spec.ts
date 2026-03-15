import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  createMockAbility,
  createMockSpaceAbilityFactory,
  createMockUser,
  createMockWorkspace,
} from '../../test-utils/test-helpers';
import { SearchController } from './search.controller';
import { SearchDTO, SearchShareDTO, SearchSuggestionDTO } from './dto/search.dto';
import { SearchService } from './search.service';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { SpaceMemberService } from '../space/services/space-member.service';

jest.mock(
  'src/common/decorators/public.decorator',
  () => ({
    Public: () => () => undefined,
  }),
  { virtual: true },
);

describe('SearchController', () => {
  let controller: SearchController;

  let searchService: {
    searchPage: jest.Mock;
    searchSuggestions: jest.Mock;
  };
  let spaceAbilityFactory: {
    createForUser: jest.Mock;
  };
  let environmentService: {
    getSearchDriver: jest.Mock;
  };
  let moduleRef: {
    get: jest.Mock;
  };
  let attachmentRepo: {
    searchByFileNameWithRelations: jest.Mock;
  };
  let spaceMemberService: {
    getUserSpaces: jest.Mock;
  };

  const user = createMockUser({ id: 'user-search-1' });
  const workspace = createMockWorkspace({ id: 'workspace-search-1' });

  beforeEach(async () => {
    searchService = {
      searchPage: jest.fn(),
      searchSuggestions: jest.fn(),
    };

    spaceAbilityFactory = createMockSpaceAbilityFactory(createMockAbility()) as {
      createForUser: jest.Mock;
    };

    environmentService = {
      getSearchDriver: jest.fn().mockReturnValue('database'),
    };

    moduleRef = {
      get: jest.fn(),
    };

    attachmentRepo = {
      searchByFileNameWithRelations: jest.fn().mockResolvedValue([]),
    };

    spaceMemberService = {
      getUserSpaces: jest.fn().mockResolvedValue({ items: [{ id: 'space-1' }] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchService, useValue: searchService },
        { provide: SpaceAbilityFactory, useValue: spaceAbilityFactory },
        { provide: EnvironmentService, useValue: environmentService },
        { provide: ModuleRef, useValue: moduleRef },
        { provide: AttachmentRepo, useValue: attachmentRepo },
        { provide: SpaceMemberService, useValue: spaceMemberService },
      ],
    }).compile();

    controller = module.get<SearchController>(SearchController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /search (pageSearch)', () => {
    it('calls searchService.searchPage and removes shareId when spaceId is missing', async () => {
      const dto: SearchDTO = {
        query: 'release notes',
        spaceId: '',
        shareId: 'share-1',
        limit: 10,
        offset: 0,
      };
      const response = { items: [{ id: 'page-1' }] };
      searchService.searchPage.mockResolvedValue(response);

      const result = await controller.pageSearch(dto, user, workspace);

      expect(result).toEqual(response);
      expect(dto.shareId).toBeUndefined();
      expect(searchService.searchPage).toHaveBeenCalledWith(dto, {
        userId: user.id,
        workspaceId: workspace.id,
      });
    });

    it('returns value from searchService.searchPage for database driver', async () => {
      const dto: SearchDTO = {
        query: 'meeting notes',
        spaceId: '',
      };
      const response = { items: [{ id: 'page-2' }, { id: 'page-3' }] };
      searchService.searchPage.mockResolvedValue(response);

      const result = await controller.pageSearch(dto, user, workspace);

      expect(result).toEqual(response);
    });

    it('checks read permission and searches when spaceId is provided', async () => {
      const ability = createMockAbility({ can: true });
      spaceAbilityFactory.createForUser.mockResolvedValue(ability);
      const dto: SearchDTO = {
        query: 'roadmap',
        spaceId: 'space-123',
      };
      const response = { items: [{ id: 'page-4' }] };
      searchService.searchPage.mockResolvedValue(response);

      const result = await controller.pageSearch(dto, user, workspace);

      expect(result).toEqual(response);
      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(
        user,
        'space-123',
      );
      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Read,
        SpaceCaslSubject.Page,
      );
      expect(searchService.searchPage).toHaveBeenCalledWith(dto, {
        userId: user.id,
        workspaceId: workspace.id,
      });
    });

    it('throws ForbiddenException when space read permission is denied', async () => {
      const deniedAbility = createMockAbility({ can: false });
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);
      const dto: SearchDTO = {
        query: 'private docs',
        spaceId: 'space-private',
      };

      await expect(controller.pageSearch(dto, user, workspace)).rejects.toThrow(
        ForbiddenException,
      );
      expect(searchService.searchPage).not.toHaveBeenCalled();
    });

    it('does not check space ability when spaceId is not provided', async () => {
      const dto: SearchDTO = {
        query: 'global docs',
        spaceId: '',
      };
      searchService.searchPage.mockResolvedValue({ items: [] });

      await controller.pageSearch(dto, user, workspace);

      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });

    it('throws BadRequestException with typesense driver when EE module is unavailable', async () => {
      const dto: SearchDTO = {
        query: 'ee search',
        spaceId: '',
      };
      environmentService.getSearchDriver.mockReturnValue('typesense');
      moduleRef.get.mockImplementation(() => {
        throw new Error('missing enterprise provider');
      });

      await expect(controller.pageSearch(dto, user, workspace)).rejects.toThrow(
        new BadRequestException('Enterprise Typesense search module missing'),
      );
      expect(searchService.searchPage).not.toHaveBeenCalled();
    });

    it('checks space permission before typesense path when spaceId is provided', async () => {
      const ability = createMockAbility({ can: true });
      spaceAbilityFactory.createForUser.mockResolvedValue(ability);
      environmentService.getSearchDriver.mockReturnValue('typesense');
      moduleRef.get.mockImplementation(() => {
        throw new Error('module ref unavailable');
      });
      const dto: SearchDTO = {
        query: 'space scoped ee',
        spaceId: 'space-typesense',
      };

      await expect(controller.pageSearch(dto, user, workspace)).rejects.toThrow(
        BadRequestException,
      );
      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(
        user,
        'space-typesense',
      );
      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Read,
        SpaceCaslSubject.Page,
      );
      expect(searchService.searchPage).not.toHaveBeenCalled();
    });

    it('removes shareId even when typesense path throws', async () => {
      const dto: SearchDTO = {
        query: 'remove share in ee',
        spaceId: '',
        shareId: 'share-to-strip',
      };
      environmentService.getSearchDriver.mockReturnValue('typesense');
      moduleRef.get.mockImplementation(() => {
        throw new Error('module ref unavailable');
      });

      await expect(controller.pageSearch(dto, user, workspace)).rejects.toThrow(
        BadRequestException,
      );
      expect(dto.shareId).toBeUndefined();
    });
  });

  describe('POST /search/suggest (searchSuggestions)', () => {
    it('calls searchService.searchSuggestions with dto, userId, workspaceId', async () => {
      const dto: SearchSuggestionDTO = {
        query: 'ali',
        includeUsers: true,
      };
      const response = {
        users: [{ id: 'user-2' }],
        groups: [],
        pages: [],
      };
      searchService.searchSuggestions.mockResolvedValue(response);

      const result = await controller.searchSuggestions(dto, user, workspace);

      expect(result).toEqual(response);
      expect(searchService.searchSuggestions).toHaveBeenCalledWith(
        dto,
        user.id,
        workspace.id,
      );
    });

    it('returns empty suggestions payload from service unchanged', async () => {
      const dto: SearchSuggestionDTO = {
        query: 'none',
      };
      const response = {
        users: [],
        groups: [],
        pages: [],
      };
      searchService.searchSuggestions.mockResolvedValue(response);

      const result = await controller.searchSuggestions(dto, user, workspace);

      expect(result).toEqual(response);
    });

    it('passes all optional suggestion flags and values to service', async () => {
      const dto: SearchSuggestionDTO = {
        query: 'eng',
        includeUsers: true,
        includeGroups: true,
        includePages: true,
        spaceId: 'space-abc',
        limit: 5,
      };
      searchService.searchSuggestions.mockResolvedValue({
        users: [],
        groups: [],
        pages: [],
      });

      await controller.searchSuggestions(dto, user, workspace);

      expect(searchService.searchSuggestions).toHaveBeenCalledWith(
        dto,
        user.id,
        workspace.id,
      );
    });

    it('propagates errors from searchService.searchSuggestions', async () => {
      const dto: SearchSuggestionDTO = {
        query: 'failing query',
      };
      searchService.searchSuggestions.mockRejectedValue(
        new Error('suggestions failed'),
      );

      await expect(
        controller.searchSuggestions(dto, user, workspace),
      ).rejects.toThrow('suggestions failed');
    });
  });

  describe('POST /search/share-search (searchShare)', () => {
    it('calls searchService.searchPage with workspace context only and removes spaceId', async () => {
      const dto: SearchShareDTO = {
        query: 'shared page',
        shareId: 'share-abc',
        spaceId: 'space-to-remove',
      };
      const response = { items: [{ id: 'page-share-1' }] };
      searchService.searchPage.mockResolvedValue(response);

      const result = await controller.searchShare(dto, workspace);

      expect(result).toEqual(response);
      expect(dto.spaceId).toBeUndefined();
      expect(searchService.searchPage).toHaveBeenCalledWith(dto, {
        workspaceId: workspace.id,
      });
      expect(searchService.searchPage).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: expect.any(String) }),
      );
    });

    it('returns value from searchService.searchPage for share search', async () => {
      const dto: SearchShareDTO = {
        query: 'shared docs',
        shareId: 'share-def',
        spaceId: '',
      };
      const response = { items: [{ id: 'page-share-2' }, { id: 'page-share-3' }] };
      searchService.searchPage.mockResolvedValue(response);

      const result = await controller.searchShare(dto, workspace);

      expect(result).toEqual(response);
    });

    it('throws BadRequestException when shareId is missing', async () => {
      const dto: SearchShareDTO = {
        query: 'missing share',
        shareId: '',
        spaceId: '',
      };

      await expect(controller.searchShare(dto, workspace)).rejects.toThrow(
        new BadRequestException('shareId is required'),
      );
      expect(searchService.searchPage).not.toHaveBeenCalled();
    });

    it('removes spaceId before validating missing shareId', async () => {
      const dto: SearchShareDTO = {
        query: 'missing share with space',
        shareId: '',
        spaceId: 'space-before-error',
      };

      await expect(controller.searchShare(dto, workspace)).rejects.toThrow(
        BadRequestException,
      );
      expect(dto.spaceId).toBeUndefined();
      expect(searchService.searchPage).not.toHaveBeenCalled();
    });

    it('keeps shareId on dto when searching shared content', async () => {
      const dto: SearchShareDTO = {
        query: 'preserve share id',
        shareId: 'share-keep-1',
        spaceId: 'space-remove-2',
      };
      searchService.searchPage.mockResolvedValue({ items: [] });

      await controller.searchShare(dto, workspace);

      expect(dto.shareId).toBe('share-keep-1');
    });

    it('throws BadRequestException with typesense driver when EE module is unavailable', async () => {
      const dto: SearchShareDTO = {
        query: 'shared ee search',
        shareId: 'share-ee-1',
        spaceId: '',
      };
      environmentService.getSearchDriver.mockReturnValue('typesense');
      moduleRef.get.mockImplementation(() => {
        throw new Error('missing enterprise provider');
      });

      await expect(controller.searchShare(dto, workspace)).rejects.toThrow(
        new BadRequestException('Enterprise Typesense search module missing'),
      );
      expect(searchService.searchPage).not.toHaveBeenCalled();
    });

    it('does not call space ability factory for public share search endpoint', async () => {
      const dto: SearchShareDTO = {
        query: 'public share',
        shareId: 'share-public-1',
        spaceId: '',
      };
      searchService.searchPage.mockResolvedValue({ items: [] });

      await controller.searchShare(dto, workspace);

      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });
  });

  describe('POST /search/attachments (searchAttachments)', () => {
    it('searches attachments scoped to user spaces', async () => {
      const dto: SearchDTO = { query: 'report.pdf', spaceId: '' };
      const items = [{ id: 'att-1', fileName: 'report.pdf' }];
      attachmentRepo.searchByFileNameWithRelations.mockResolvedValue(items);

      const result = await controller.searchAttachments(dto, user, workspace);

      expect(result).toEqual({ items });
      expect(spaceMemberService.getUserSpaces).toHaveBeenCalledWith(
        user.id,
        expect.anything(),
      );
      expect(attachmentRepo.searchByFileNameWithRelations).toHaveBeenCalledWith(
        'report.pdf',
        workspace.id,
        ['space-1'],
        25,
      );
    });

    it('filters spaceIds when spaceId filter is provided', async () => {
      spaceMemberService.getUserSpaces.mockResolvedValue({
        items: [{ id: 'space-1' }, { id: 'space-2' }],
      });
      attachmentRepo.searchByFileNameWithRelations.mockResolvedValue([]);
      const dto: SearchDTO = { query: 'doc', spaceId: 'space-2' };

      await controller.searchAttachments(dto, user, workspace);

      expect(attachmentRepo.searchByFileNameWithRelations).toHaveBeenCalledWith(
        'doc',
        workspace.id,
        ['space-2'],
        25,
      );
    });

    it('checks space permission when spaceId is provided', async () => {
      const ability = createMockAbility({ can: true });
      spaceAbilityFactory.createForUser.mockResolvedValue(ability);
      const dto: SearchDTO = { query: 'file', spaceId: 'space-restricted' };
      attachmentRepo.searchByFileNameWithRelations.mockResolvedValue([]);

      await controller.searchAttachments(dto, user, workspace);

      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(
        user,
        'space-restricted',
      );
    });

    it('throws ForbiddenException when space read is denied', async () => {
      const deniedAbility = createMockAbility({ can: false });
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);
      const dto: SearchDTO = { query: 'secret', spaceId: 'space-denied' };

      await expect(
        controller.searchAttachments(dto, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(attachmentRepo.searchByFileNameWithRelations).not.toHaveBeenCalled();
    });

    it('does not check space ability when spaceId is not provided', async () => {
      const dto: SearchDTO = { query: 'global', spaceId: '' };
      attachmentRepo.searchByFileNameWithRelations.mockResolvedValue([]);

      await controller.searchAttachments(dto, user, workspace);

      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });
  });
});
