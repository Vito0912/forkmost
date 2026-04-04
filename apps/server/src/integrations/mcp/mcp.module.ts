import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';
import { McpAuthGuard } from './mcp-auth.guard';
import { PageModule } from '../../core/page/page.module';
import { SpaceModule } from '../../core/space/space.module';
import { CommentModule } from '../../core/comment/comment.module';
import { SearchModule } from '../../core/search/search.module';

@Module({
  imports: [
    JwtModule.register({}),
    PageModule,
    SpaceModule,
    CommentModule,
    SearchModule,
  ],
  controllers: [McpController],
  providers: [McpServerFactory, McpAuthGuard],
})
export class McpModule {}
