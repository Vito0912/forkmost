import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServerFactory } from './mcp-server.factory';
import { McpAuthGuard } from './mcp-auth.guard';

type McpRequest = FastifyRequest & {
  mcpAuth: {
    user: { id: string };
    workspace: { id: string };
  };
};

@Controller('mcp')
@UseGuards(McpAuthGuard)
export class McpController {
  constructor(private readonly mcpServerFactory: McpServerFactory) {}

  @All()
  async handleMcp(@Req() req: McpRequest, @Res() res: FastifyReply) {
    const { user, workspace } = req.mcpAuth;
    const server = this.mcpServerFactory.createServer(user, workspace);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);

      res.hijack();
      await transport.handleRequest(req.raw, res.raw, req.body);
    } finally {
      await transport.close();
      await server.close();
    }
  }
}
