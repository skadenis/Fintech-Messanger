import { Module, forwardRef } from '@nestjs/common';
import { AccessService } from '../common/access.service';
import { GatewayModule } from '../gateway/gateway.module';
import { WappiModule } from '../wappi/wappi.module';
import { MessagesController, MessageAttachmentController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [WappiModule, forwardRef(() => GatewayModule)],
  controllers: [MessagesController, MessageAttachmentController],
  providers: [MessagesService, AccessService],
  exports: [MessagesService],
})
export class MessagesModule {}
