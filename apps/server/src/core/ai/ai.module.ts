import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OpenAiService } from './openai/openai.service';
import { EnvironmentModule } from '../../integrations/environment/environment.module';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '../../integrations/queue/constants';
import { AiQueueProcessor } from './ai.queue.processor';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { DatabaseModule } from '@docmost/db/database.module';

@Module({
  imports: [
    EnvironmentModule,
    DatabaseModule,
    BullModule.registerQueue({
      name: QueueName.AI_QUEUE,
    }),
  ],
  controllers: [AiController],
  providers: [AiService, OpenAiService, AiQueueProcessor, PageRepo],
  exports: [AiService],
})
export class AiModule {}
