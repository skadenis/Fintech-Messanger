import { Module, forwardRef } from '@nestjs/common';
import { AccessService } from '../common/access.service';
import { MessagesModule } from '../messages/messages.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [forwardRef(() => MessagesModule)],
  controllers: [ConversationsController],
  providers: [ConversationsService, AccessService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
