jest.mock('./mcp-server.factory', () => ({
  McpServerFactory: jest.fn(),
}));
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: jest.fn().mockImplementation(() => ({
    handleRequest: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';
import { McpAuthGuard } from './mcp-auth.guard';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

describe('McpController', () => {
  let controller: McpController;

  let mcpServerFactory: {
    createServer: jest.Mock;
  };

  let mockMcpServer: {
    connect: jest.Mock;
    close: jest.Mock;
  };

  beforeEach(async () => {
    mockMcpServer = {
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mcpServerFactory = {
      createServer: jest.fn().mockReturnValue(mockMcpServer),
    };

    const moduleBuilder = Test.createTestingModule({
      controllers: [McpController],
      providers: [
        {
          provide: McpServerFactory,
          useValue: mcpServerFactory,
        },
      ],
    });

    moduleBuilder.overrideGuard(McpAuthGuard).useValue({
      canActivate: jest.fn().mockReturnValue(true),
    });

    const module: TestingModule = await moduleBuilder.compile();
    controller = module.get<McpController>(McpController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleMcp', () => {
    function createMockRequest(overrides: Record<string, any> = {}): any {
      return {
        mcpAuth: {
          user: { id: 'user-id-1' },
          workspace: { id: 'workspace-id-1' },
        },
        raw: { url: '/mcp', method: 'POST' },
        body: { jsonrpc: '2.0', method: 'initialize', id: 1 },
        ...overrides,
      };
    }

    function createMockReply(): any {
      return {
        hijack: jest.fn(),
        raw: {},
      };
    }

    it('should create server with user and workspace from mcpAuth', async () => {
      const req = createMockRequest();
      const res = createMockReply();

      await controller.handleMcp(req, res);

      expect(mcpServerFactory.createServer).toHaveBeenCalledWith(
        { id: 'user-id-1' },
        { id: 'workspace-id-1' },
      );
    });

    it('should connect server to transport', async () => {
      const req = createMockRequest();
      const res = createMockReply();

      await controller.handleMcp(req, res);

      expect(mockMcpServer.connect).toHaveBeenCalled();
    });

    it('should hijack the Fastify response', async () => {
      const req = createMockRequest();
      const res = createMockReply();

      await controller.handleMcp(req, res);

      expect(res.hijack).toHaveBeenCalled();
    });

    it('should create transport with stateless config', async () => {
      const req = createMockRequest();
      const res = createMockReply();

      await controller.handleMcp(req, res);

      expect(StreamableHTTPServerTransport).toHaveBeenCalledWith({
        sessionIdGenerator: undefined,
      });
    });

    it('should close transport and server in finally block', async () => {
      const req = createMockRequest();
      const res = createMockReply();

      await controller.handleMcp(req, res);

      expect(mockMcpServer.close).toHaveBeenCalled();
    });

    it('should close server even when transport throws', async () => {
      const mockTransport = {
        handleRequest: jest.fn().mockRejectedValue(new Error('transport error')),
        close: jest.fn().mockResolvedValue(undefined),
      };
      (StreamableHTTPServerTransport as unknown as jest.Mock).mockImplementationOnce(
        () => mockTransport,
      );

      const req = createMockRequest();
      const res = createMockReply();

      await expect(controller.handleMcp(req, res)).rejects.toThrow('transport error');
      expect(mockMcpServer.close).toHaveBeenCalled();
      expect(mockTransport.close).toHaveBeenCalled();
    });

    it('should pass different user contexts correctly', async () => {
      const req = createMockRequest({
        mcpAuth: {
          user: { id: 'other-user-id' },
          workspace: { id: 'other-workspace-id' },
        },
      });
      const res = createMockReply();

      await controller.handleMcp(req, res);

      expect(mcpServerFactory.createServer).toHaveBeenCalledWith(
        { id: 'other-user-id' },
        { id: 'other-workspace-id' },
      );
    });
  });
});
