import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  createMockAbility,
  createMockSpaceAbilityFactory,
  createMockUser,
  createMockWorkspace,
  createMockWorkspaceAbilityFactory,
} from '../../test-utils/test-helpers';
import { FileTaskController } from './file-task.controller';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';

jest.mock('@docmost/db/pagination/cursor-pagination', () => ({
  executeWithCursorPagination: jest.fn(),
}));

describe('FileTaskController', () => {
  let controller: FileTaskController;
  let spaceAbilityFactory: { createForUser: jest.Mock };
  let workspaceAbilityFactory: { createForUser: jest.Mock };
  let spaceMemberRepo: { getUserSpaceIdsQuery: jest.Mock };
  let db: { selectFrom: jest.Mock };

  const user = createMockUser({ id: 'user-file-task-1' });
  const workspace = createMockWorkspace({ id: 'workspace-file-task-1' });

  const createQueryChain = () => {
    const chain = {
      selectAll: jest.fn(),
      where: jest.fn(),
      executeTakeFirst: jest.fn(),
    };

    chain.selectAll.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);

    return chain;
  };

  beforeEach(() => {
    spaceAbilityFactory = createMockSpaceAbilityFactory(createMockAbility()) as {
      createForUser: jest.Mock;
    };

    workspaceAbilityFactory = createMockWorkspaceAbilityFactory(
      createMockAbility({ can: true }),
    ) as {
      createForUser: jest.Mock;
    };

    spaceMemberRepo = {
      getUserSpaceIdsQuery: jest.fn().mockReturnValue(['space-1', 'space-2']),
    };

    db = {
      selectFrom: jest.fn(),
    };

    controller = new FileTaskController(
      spaceAbilityFactory as any,
      workspaceAbilityFactory as any,
      spaceMemberRepo as any,
      db as any,
    );

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /file-tasks', () => {
    it('returns paginated file tasks when workspace permission is allowed', async () => {
      const chain = createQueryChain();
      const paginationResult = {
        data: [{ id: 'task-1' }],
        pageInfo: { hasNextPage: false },
      };

      db.selectFrom.mockReturnValue(chain);
      (executeWithCursorPagination as jest.Mock).mockResolvedValue(paginationResult);

      const result = await controller.getFileTasks(
        { limit: 20, cursor: 'cursor-1', beforeCursor: '', query: '', adminView: false },
        user,
        workspace,
      );

      expect(workspaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, workspace);
      expect(db.selectFrom).toHaveBeenCalledWith('fileTasks');
      expect(spaceMemberRepo.getUserSpaceIdsQuery).toHaveBeenCalledWith(user.id);
      expect(chain.where).toHaveBeenCalledWith(
        'spaceId',
        'in',
        expect.any(Array),
      );
      expect(executeWithCursorPagination).toHaveBeenCalledWith(
        chain,
        expect.objectContaining({
          perPage: 20,
          cursor: 'cursor-1',
          beforeCursor: '',
        }),
      );
      expect(result).toEqual(paginationResult);
    });

    it('throws ForbiddenException when workspace settings permission is denied', async () => {
      const deniedAbility = createMockAbility({ can: false });
      workspaceAbilityFactory.createForUser.mockReturnValue(deniedAbility);

      await expect(
        controller.getFileTasks(
          { limit: 10, cursor: '', beforeCursor: '', query: '', adminView: false },
          user,
          workspace,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(db.selectFrom).not.toHaveBeenCalled();
      expect(executeWithCursorPagination).not.toHaveBeenCalled();
    });
  });

  describe('POST /file-tasks/info', () => {
    it('returns file task when found and user can read space pages', async () => {
      const fileTask = { id: 'task-1', spaceId: 'space-1', status: 'processing' };
      const chain = createQueryChain();

      chain.executeTakeFirst.mockResolvedValue(fileTask);
      db.selectFrom.mockReturnValue(chain);

      const result = await controller.getFileTask(
        { fileTaskId: '76f3c188-80d2-4fc4-910d-e4af9f44db30' },
        user,
      );

      expect(db.selectFrom).toHaveBeenCalledWith('fileTasks');
      expect(chain.where).toHaveBeenCalledWith(
        'id',
        '=',
        '76f3c188-80d2-4fc4-910d-e4af9f44db30',
      );
      expect(spaceAbilityFactory.createForUser).toHaveBeenCalledWith(user, fileTask.spaceId);
      expect(result).toEqual(fileTask);
    });

    it('throws NotFoundException when file task does not exist', async () => {
      const chain = createQueryChain();

      chain.executeTakeFirst.mockResolvedValue(null);
      db.selectFrom.mockReturnValue(chain);

      await expect(
        controller.getFileTask(
          { fileTaskId: '76f3c188-80d2-4fc4-910d-e4af9f44db30' },
          user,
        ),
      ).rejects.toThrow(new NotFoundException('File task not found'));
      expect(spaceAbilityFactory.createForUser).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when file task has no spaceId', async () => {
      const chain = createQueryChain();

      chain.executeTakeFirst.mockResolvedValue({ id: 'task-1', spaceId: null });
      db.selectFrom.mockReturnValue(chain);

      await expect(
        controller.getFileTask(
          { fileTaskId: '76f3c188-80d2-4fc4-910d-e4af9f44db30' },
          user,
        ),
      ).rejects.toThrow(new NotFoundException('File task not found'));
    });

    it('throws ForbiddenException when user cannot read page in task space', async () => {
      const deniedAbility = createMockAbility({ can: false });
      spaceAbilityFactory.createForUser.mockResolvedValue(deniedAbility);

      const chain = createQueryChain();
      chain.executeTakeFirst.mockResolvedValue({
        id: 'task-1',
        spaceId: 'space-locked',
      });
      db.selectFrom.mockReturnValue(chain);

      await expect(
        controller.getFileTask(
          { fileTaskId: '76f3c188-80d2-4fc4-910d-e4af9f44db30' },
          user,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
