import { ForbiddenException } from '@nestjs/common';
import { registerSpaceTools } from './space.tools';

describe('Space Tools Authorization', () => {
  const toolHandlers = new Map<string, Function>();

  const mockUser = { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'member' } as any;
  const mockWorkspace = { id: 'ws-1' } as any;

  let spaceService: Record<string, jest.Mock>;
  let spaceMemberService: Record<string, jest.Mock>;
  let spaceAbility: Record<string, jest.Mock>;
  let workspaceAbility: Record<string, jest.Mock>;
  let mockSpaceAbilityResult: { can: jest.Mock; cannot: jest.Mock };
  let mockWorkspaceAbilityResult: { can: jest.Mock; cannot: jest.Mock };

  beforeEach(() => {
    toolHandlers.clear();

    const mockServer = {
      tool: jest.fn((...args: any[]) => {
        const name = args[0];
        const handler = args[args.length - 1];
        toolHandlers.set(name, handler);
      }),
    };

    mockSpaceAbilityResult = {
      can: jest.fn().mockReturnValue(true),
      cannot: jest.fn().mockReturnValue(false),
    };

    mockWorkspaceAbilityResult = {
      can: jest.fn().mockReturnValue(true),
      cannot: jest.fn().mockReturnValue(false),
    };

    spaceService = {
      getSpaceInfo: jest.fn().mockResolvedValue({
        id: 'space-1', name: 'Test Space', slug: 'test', description: '', createdAt: new Date(),
      }),
      createSpace: jest.fn().mockResolvedValue({
        id: 'space-new', name: 'New', slug: 'new', description: '',
      }),
      updateSpace: jest.fn().mockResolvedValue({
        id: 'space-1', name: 'Updated', slug: 'test', description: '',
      }),
    };

    spaceMemberService = {
      getUserSpaces: jest.fn().mockResolvedValue({ items: [] }),
    };

    spaceAbility = {
      createForUser: jest.fn().mockResolvedValue(mockSpaceAbilityResult),
    };

    workspaceAbility = {
      createForUser: jest.fn().mockReturnValue(mockWorkspaceAbilityResult),
    };

    registerSpaceTools(
      mockServer as any,
      mockUser,
      mockWorkspace,
      spaceService as any,
      spaceMemberService as any,
      spaceAbility as any,
      workspaceAbility as any,
    );
  });

  function callTool(name: string, args: Record<string, any> = {}) {
    return toolHandlers.get(name)!(args);
  }

  describe('list_spaces', () => {
    it('should not require CASL check — scoped by getUserSpaces', async () => {
      await callTool('list_spaces');

      expect(spaceAbility.createForUser).not.toHaveBeenCalled();
      expect(workspaceAbility.createForUser).not.toHaveBeenCalled();
      expect(spaceMemberService.getUserSpaces).toHaveBeenCalledWith(mockUser.id, expect.anything());
    });
  });

  describe('get_space', () => {
    it('should check space read settings permission', async () => {
      await callTool('get_space', { spaceId: 'space-1' });

      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-1');
    });

    it('should deny when user cannot read space settings', async () => {
      mockSpaceAbilityResult.cannot.mockReturnValue(true);

      const result = await callTool('get_space', { spaceId: 'space-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(spaceService.getSpaceInfo).not.toHaveBeenCalled();
    });
  });

  describe('create_space', () => {
    it('should check workspace manage space permission', async () => {
      await callTool('create_space', { name: 'New', slug: 'new' });

      expect(workspaceAbility.createForUser).toHaveBeenCalledWith(mockUser, mockWorkspace);
    });

    it('should deny when user cannot manage spaces', async () => {
      mockWorkspaceAbilityResult.cannot.mockReturnValue(true);

      const result = await callTool('create_space', { name: 'New', slug: 'new' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(spaceService.createSpace).not.toHaveBeenCalled();
    });
  });

  describe('update_space', () => {
    it('should check space manage settings permission', async () => {
      await callTool('update_space', { spaceId: 'space-1', name: 'Updated' });

      expect(spaceAbility.createForUser).toHaveBeenCalledWith(mockUser, 'space-1');
    });

    it('should deny when user cannot manage space settings', async () => {
      mockSpaceAbilityResult.cannot.mockReturnValue(true);

      const result = await callTool('update_space', { spaceId: 'space-1', name: 'Updated' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(spaceService.updateSpace).not.toHaveBeenCalled();
    });
  });
});
