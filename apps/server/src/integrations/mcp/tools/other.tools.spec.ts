import { ForbiddenException } from '@nestjs/common';
import { registerOtherTools } from './other.tools';

describe('Other Tools Authorization', () => {
  const toolHandlers = new Map<string, Function>();

  const mockUser = { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'member' } as any;
  const mockWorkspace = { id: 'ws-1' } as any;

  let attachmentRepo: Record<string, jest.Mock>;
  let userRepo: Record<string, jest.Mock>;
  let spaceMemberService: Record<string, jest.Mock>;
  let workspaceAbility: Record<string, jest.Mock>;
  let mockAbilityResult: { can: jest.Mock; cannot: jest.Mock };

  beforeEach(() => {
    toolHandlers.clear();

    const mockServer = {
      tool: jest.fn((...args: any[]) => {
        const name = args[0];
        const handler = args[args.length - 1];
        toolHandlers.set(name, handler);
      }),
    };

    mockAbilityResult = {
      can: jest.fn().mockReturnValue(true),
      cannot: jest.fn().mockReturnValue(false),
    };

    attachmentRepo = {
      searchByFileName: jest.fn().mockResolvedValue([]),
    };

    userRepo = {
      getUsersPaginated: jest.fn().mockResolvedValue({ items: [] }),
    };

    spaceMemberService = {
      getUserSpaces: jest.fn().mockResolvedValue({ items: [] }),
    };

    workspaceAbility = {
      createForUser: jest.fn().mockReturnValue(mockAbilityResult),
    };

    registerOtherTools(
      mockServer as any,
      mockUser,
      mockWorkspace,
      attachmentRepo as any,
      userRepo as any,
      spaceMemberService as any,
      workspaceAbility as any,
    );
  });

  function callTool(name: string, args: Record<string, any> = {}) {
    return toolHandlers.get(name)!(args);
  }

  describe('search_attachments', () => {
    it('should scope by user spaces without additional CASL check', async () => {
      await callTool('search_attachments', { query: 'file' });

      expect(spaceMemberService.getUserSpaces).toHaveBeenCalledWith(mockUser.id, expect.anything());
      expect(workspaceAbility.createForUser).not.toHaveBeenCalled();
    });
  });

  describe('list_workspace_members', () => {
    it('should check workspace read member permission', async () => {
      await callTool('list_workspace_members');

      expect(workspaceAbility.createForUser).toHaveBeenCalledWith(mockUser, mockWorkspace);
    });

    it('should deny when user cannot read members', async () => {
      mockAbilityResult.cannot.mockReturnValue(true);

      const result = await callTool('list_workspace_members');

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(userRepo.getUsersPaginated).not.toHaveBeenCalled();
    });

    it('should allow when user has read member permission', async () => {
      const result = await callTool('list_workspace_members');

      expect(result.isError).toBeUndefined();
      expect(userRepo.getUsersPaginated).toHaveBeenCalled();
    });
  });

  describe('get_current_user', () => {
    it('should not require any permission check', async () => {
      const result = await callTool('get_current_user');

      expect(workspaceAbility.createForUser).not.toHaveBeenCalled();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe('user-1');
    });
  });
});
